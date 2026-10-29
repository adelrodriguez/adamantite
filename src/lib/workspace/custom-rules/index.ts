import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { CustomRuleExists, FailedToReadFile, InvalidRuleName } from "#lib/shared/errors.ts"
import { ensureDirectory, readDirectoryIfExists, writeFile } from "#lib/shared/filesystem.ts"
import { discoverCustomRules } from "#lib/workspace/custom-rules/discover.ts"
import { isRuleFile } from "#lib/workspace/custom-rules/inspect.ts"
import {
  getStubTemplate,
  getTestStubTemplate,
} from "#lib/workspace/custom-rules/stub.macro.ts" with { type: "macro" }
import { checkIsMonorepo, getWorkspacePackageDirectories } from "#lib/workspace/monorepo.ts"

const stubTemplate = getStubTemplate()
const testStubTemplate = getTestStubTemplate()

/**
 * The rules folder that `custom()` loads when no `dir` is given, relative to the file that calls
 * it.
 */
export const CUSTOM_RULES_DIRECTORY = ".adamantite/rules"

/**
 * The folder in a rules folder that holds the rule tests. `custom()` does not read subfolders, and
 * the default Vitest and Jest patterns do not match `tests/<name>.ts`, so only `adamantite rule
 * test` runs these files.
 */
export const CUSTOM_RULE_TESTS_DIRECTORY = "tests"

const RULE_NAME_PATTERN = /^[a-z][\da-z]*(?:-[\da-z]+)*$/

/**
 * The stub that `adamantite rule add` writes: a working rule that the author replaces.
 */
export function toCustomRuleStub(name: string): string {
  return stubTemplate.replaceAll("{{name}}", name)
}

/**
 * The test that `rule add` writes beside the stub: one valid case and one invalid case.
 */
export function toCustomRuleTestStub(name: string): string {
  return testStubTemplate.replaceAll("{{name}}", name)
}

/**
 * Write a rule stub to the rules folder, and its test to `tests/` in that folder. A relative `dir`
 * resolves from `cwd`. When the rule or the test exists, write nothing.
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
  const testPath = path.join(directory, CUSTOM_RULE_TESTS_DIRECTORY, `${name}.ts`)
  const existing = yield* Effect.filter([rulePath, testPath], (file) =>
    fs.exists(file).pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: file })))
  )

  if (existing.length > 0) {
    return yield* new CustomRuleExists({ paths: existing })
  }

  yield* ensureDirectory(path.dirname(testPath))
  yield* writeFile(rulePath, toCustomRuleStub(name))
  yield* writeFile(testPath, toCustomRuleTestStub(name))

  return { rulePath, testPath }
})

/**
 * The rule tests of each rules folder that a `custom()` call loads, in sorted order. A test is a
 * file in `tests/` that would be a rule in the rules folder, so a `_` file is a helper.
 */
export const listCustomRuleTests = Effect.fn("listCustomRuleTests")(function* (cwd: string) {
  const path = yield* Path.Path
  const packageDirectories = [
    cwd,
    ...((yield* checkIsMonorepo(cwd)) ? yield* getWorkspacePackageDirectories(cwd) : []),
  ]
  const { calls } = yield* discoverCustomRules(packageDirectories)
  const testDirectories = Array.dedupe(
    calls.flatMap((call) =>
      call.dir === null ? [] : [path.join(call.dir, CUSTOM_RULE_TESTS_DIRECTORY)]
    )
  )
  const tests = yield* Effect.forEach(
    testDirectories,
    (directory) =>
      readDirectoryIfExists(directory).pipe(
        Effect.map((names) =>
          Option.getOrElse(names, () => [])
            .filter((name) => isRuleFile(name))
            .map((name) => path.join(directory, name))
        )
      ),
    { concurrency: "unbounded" }
  )

  return Array.sort(tests.flat(), Order.String)
})
