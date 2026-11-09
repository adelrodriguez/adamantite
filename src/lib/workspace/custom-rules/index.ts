import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import type { CustomRuleDiscovery } from "#lib/workspace/custom-rules/discover.ts"
import type { Project } from "#lib/workspace/project.ts"
import {
  CustomRuleExists,
  CustomRuleNotFound,
  FailedToReadFile,
  InvalidRuleName,
} from "#lib/shared/errors.ts"
import { ensureDirectory, readDirectoryIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { stringifyJson } from "#lib/shared/json.ts"
import { isRuleFile, isRuleTestFile } from "#lib/workspace/custom-rules/inspect.ts"
import {
  getStubTemplate,
  getTestStubTemplate,
} from "#lib/workspace/custom-rules/stub.macro.ts" with { type: "macro" }

const stubTemplate = getStubTemplate()
const testStubTemplate = getTestStubTemplate()

/**
 * The rules folder that `custom()` loads when no `dir` is given, relative to the file that calls
 * it.
 */
export const CUSTOM_RULES_DIRECTORY = ".adamantite/lint"

const RULE_NAME_PATTERN = /^[a-z][\da-z]*(?:-[\da-z]+)*$/

/**
 * The stub that `adamantite rule add` writes: a working rule that the author replaces.
 */
export function toCustomRuleStub(name: string): string {
  return stubTemplate.replaceAll("{{name}}", name)
}

/**
 * Write only a rule stub. Agents verify it with temporary RuleTester cases. A relative dir resolves
 * from cwd. An existing rule stays unchanged.
 */
export const addCustomRule = Effect.fn("addCustomRule")(function* (
  cwd: string,
  name: string,
  dir: string = CUSTOM_RULES_DIRECTORY
) {
  if (!RULE_NAME_PATTERN.test(name)) {
    return yield* new InvalidRuleName({ rule: name })
  }

  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const directory = path.resolve(cwd, dir)
  const rulePath = path.join(directory, `${name}.ts`)

  const exists = yield* fs
    .exists(rulePath)
    .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: rulePath })))

  if (exists) {
    return yield* new CustomRuleExists({ paths: [rulePath] })
  }

  yield* ensureDirectory(directory)
  yield* writeFile(rulePath, toCustomRuleStub(name))

  return rulePath
})

/**
 * List the rules that can receive an optional test, in file-name order.
 */
export const listCustomRules = Effect.fn("listCustomRules")(function* (
  cwd: string,
  dir: string = CUSTOM_RULES_DIRECTORY
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

/**
 * Write an optional test for an existing rule. The test defaults to a sibling `.test.ts` file; an
 * explicit target resolves from cwd. Existing tests stay unchanged.
 */
export const addCustomRuleTest = Effect.fn("addCustomRuleTest")(function* (
  cwd: string,
  name: string,
  dir: string = CUSTOM_RULES_DIRECTORY,
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

  const relative = path
    .relative(path.dirname(testPath), path.join(directory, rule))
    .split(path.sep)
    .join("/")

  const ruleImport = relative.startsWith("../") ? relative : `./${relative}`
  const importLiteral = yield* stringifyJson(ruleImport)
  yield* ensureDirectory(path.dirname(testPath))
  yield* writeFile(
    testPath,
    testStubTemplate.replaceAll("{{name}}", name).replace("{{ruleImport}}", importLiteral)
  )

  return testPath
})

/**
 * The optional rule tests of each rules folder that a `custom()` call loads, in sorted order. A
 * test is a `.test.*` file beside the rules, so a `_` file is a helper. Discovery cannot follow a
 * `custom()` call whose `dir` is not a string literal, or an import that it cannot resolve, so the
 * tests of those rules folders are not in the result.
 */
export const findCustomRuleTests = Effect.fn("findCustomRuleTests")(function* (
  customRules: CustomRuleDiscovery
) {
  const path = yield* Path.Path
  const testDirectories = Array.dedupe(customRules.calls.map((call) => call.dir))

  const tests = yield* Effect.forEach(
    testDirectories,
    (directory) =>
      readDirectoryIfExists(directory).pipe(
        Effect.map((names) =>
          Option.getOrElse(names, () => [])
            .filter((name) => isRuleTestFile(name))
            .map((name) => path.join(directory, name))
        )
      ),
    { concurrency: "unbounded" }
  )

  return Array.sort(tests.flat(), Order.String)
})

/**
 * The command that runs the rule tests, with paths relative to the project root, or none when no
 * test exists, and the `custom()` calls and imports that discovery could not follow. `RuleTester`
 * runs only on Node.js, so the tests run under Node.js, also in a Bun project.
 */
export const readCustomRuleTestCommand = Effect.fn("readCustomRuleTestCommand")(function* ({
  customRules,
  cwd,
}: Project) {
  const path = yield* Path.Path
  const tests = yield* findCustomRuleTests(customRules)

  return {
    command:
      tests.length === 0
        ? Option.none()
        : Option.some({
            args: ["--test", ...tests.map((test) => path.relative(cwd, test))],
            command: "node",
          }),
    unresolvedCalls: Array.dedupe(customRules.unresolvedCalls),
    unresolvedImports: customRules.unresolvedImports,
  }
})
