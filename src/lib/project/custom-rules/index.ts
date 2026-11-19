import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import {
  getStubTemplate,
  getTestStubTemplate,
} from "#lib/project/custom-rules/stub.macro.ts" with { type: "macro" }
import * as Project from "#lib/project/index.ts"
import {
  CustomRuleExists,
  CustomRuleNotFound,
  FailedToReadFile,
  InvalidRuleName,
} from "#lib/shared/errors.ts"
import { ensureDirectory, readDirectoryIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { DEFAULT_DIRECTORY, isRuleFile } from "#presets/rules/folder.ts"

const stubTemplate = getStubTemplate()
const testStubTemplate = getTestStubTemplate()

const RULE_NAME_PATTERN = /^[a-z][\da-z]*(?:-[\da-z]+)*$/

export function toCustomRuleStub(name: string): string {
  return stubTemplate.replaceAll("{{name}}", name)
}

export const addCustomRule = Effect.fn("addCustomRule")(function* (
  cwd: string,
  name: string,
  dir: string = DEFAULT_DIRECTORY
) {
  if (!RULE_NAME_PATTERN.test(name)) {
    return yield* new InvalidRuleName({ rule: name })
  }

  const path = yield* Path.Path
  const directory = path.resolve(cwd, dir)
  const rulePath = path.join(directory, `${name}.ts`)

  const existing = (yield* listCustomRules(cwd, dir)).filter(
    (file) => file.slice(0, -path.extname(file).length) === name
  )

  if (existing.length > 0) {
    return yield* new CustomRuleExists({
      paths: existing.map((file) => path.join(directory, file)),
    })
  }

  yield* ensureDirectory(directory)
  yield* writeFile(rulePath, toCustomRuleStub(name))

  return rulePath
})

export const listCustomRules = Effect.fn("listCustomRules")(function* (
  cwd: string,
  dir: string = DEFAULT_DIRECTORY
) {
  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const directory = path.resolve(cwd, dir)
  const entries = yield* readDirectoryIfExists(directory)

  const files = yield* Effect.filter(
    Option.getOrElse(entries, () => []).filter((entry) => isRuleFile(entry)),
    (entry) =>
      fs.stat(path.join(directory, entry)).pipe(
        Effect.mapBoth({
          onFailure: (cause) => new FailedToReadFile({ cause, path: path.join(directory, entry) }),
          onSuccess: (info) => info.type === "File",
        })
      )
  )

  return Array.sort(files, Order.String)
})

export const addCustomRuleTest = Effect.fn("addCustomRuleTest")(function* (
  cwd: string,
  name: string,
  dir: string = DEFAULT_DIRECTORY,
  target?: string
) {
  if (!RULE_NAME_PATTERN.test(name)) {
    return yield* new InvalidRuleName({ rule: name })
  }

  const path = yield* Path.Path
  const fs = yield* FileSystem.FileSystem
  const directory = path.resolve(cwd, dir)
  const rules = yield* listCustomRules(cwd, dir)
  const rule = rules.find((file) => file.slice(0, -path.extname(file).length) === name)

  if (rule === undefined) {
    return yield* new CustomRuleNotFound({ directory, rule: name })
  }

  const testPath =
    target === undefined ? path.join(directory, `${name}.test.ts`) : path.resolve(cwd, target)

  const exists = yield* fs
    .exists(testPath)
    .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: testPath })))

  if (exists) {
    return yield* new CustomRuleExists({ paths: [testPath] })
  }

  // Node.js resolves an import from the real path of the importing file, and a folder link, such as
  // `/var` for `/private/var` on macOS, changes the path.
  yield* ensureDirectory(path.dirname(testPath))

  const readRealPath = (file: string) =>
    fs.realPath(file).pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: file })))

  const [testDirectory, rulePath] = yield* Effect.all(
    [readRealPath(path.dirname(testPath)), readRealPath(path.join(directory, rule))],
    { concurrency: "unbounded" }
  )

  const relative = path.relative(testDirectory, rulePath).split(path.sep).join("/")
  const ruleImport = relative.startsWith("../") ? relative : `./${relative}`
  const importLiteral = yield* stringifyJson(ruleImport)
  yield* writeFile(
    testPath,
    testStubTemplate.replaceAll("{{name}}", name).replace("{{ruleImport}}", importLiteral)
  )

  return testPath
})

export const readCustomRuleTestCommand = Effect.fn("readCustomRuleTestCommand")(function* ({
  customRules,
}: Project.Snapshot) {
  const cwd = yield* Project.Directory
  const path = yield* Path.Path

  const found = yield* Effect.forEach(
    Array.dedupe(customRules.calls.map((call) => call.dir)),
    (directory) =>
      readDirectoryIfExists(directory).pipe(
        Effect.map((names) =>
          Option.getOrElse(names, () => [])
            .filter((name) => !name.startsWith("_") && /\.test\.(?:js|mjs|mts|ts)$/.test(name))
            .map((name) => path.join(directory, name))
        )
      ),
    { concurrency: "unbounded" }
  )

  const tests = Array.sort(found.flat(), Order.String)

  return {
    command:
      tests.length === 0
        ? Option.none()
        : Option.some({
            args: ["--test", ...tests.map((test) => path.relative(cwd, test))],
            // `RuleTester` runs only on Node.js.
            command: "node",
          }),
    unloadedConfigs: customRules.unloadedConfigs,
  }
})
