import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import { CustomRuleExists } from "#lib/shared/errors.ts"
import { addCustomRule, addCustomRuleTest } from "#lib/workspace/custom-rules/index.ts"

// `ROOT` is the real path, as `process.cwd()` reports it. `/link` is a symlink to it at a different
// depth, as `/var` is to `/private/var` on macOS.
const ROOT = "/private/project"
const RULE_PATH = `${ROOT}/.adamantite/lint/no-example.ts`
const RULE_IMPORT = /from "(?<specifier>\.{1,2}\/[^"]+)"/

describe("addCustomRuleTest", () => {
  it.effect.each<{ dir: string; name: string; target: string }>([
    {
      dir: ".adamantite/lint",
      name: "an absolute test path through a directory symlink",
      target: "/link/tests/no-example.test.ts",
    },
    {
      dir: "/link/.adamantite/lint",
      name: "a rules folder through a directory symlink",
      target: "tests/no-example.test.ts",
    },
  ])("import the rule from $name", ({ dir, target }) => {
    const files = createFileSystemTestContext({
      files: { [RULE_PATH]: "export default {}\n" },
      links: { "/link": ROOT },
      root: ROOT,
    })

    return Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const testPath = yield* addCustomRuleTest(ROOT, "no-example", dir, target)

      // Node resolves a relative import from the real path of the importing file.
      const realTestPath = yield* fs.realPath(testPath)
      const specifier = RULE_IMPORT.exec(files.read(testPath))?.groups?.specifier ?? ""

      const rulePath = path.resolve(path.dirname(realTestPath), specifier)

      expect(yield* Effect.option(fs.realPath(rulePath))).toStrictEqual(Option.some(RULE_PATH))
    }).pipe(Effect.provide([files.layer, Path.layer]))
  })
})

describe("addCustomRule", () => {
  it.effect("refuse a rule name that a file with another extension already uses", () => {
    const existing = `${ROOT}/.adamantite/lint/no-example.js`

    const files = createFileSystemTestContext({
      files: { [existing]: "export default {}\n" },
      root: ROOT,
    })

    return Effect.gen(function* () {
      const error = yield* Effect.flip(addCustomRule(ROOT, "no-example"))

      expect(error).toStrictEqual(new CustomRuleExists({ paths: [existing] }))
      expect(files.exists(RULE_PATH)).toBe(false)
    }).pipe(Effect.provide([files.layer, Path.layer]))
  })
})
