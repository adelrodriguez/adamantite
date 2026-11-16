import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import { createFileSystemTestContext, type FileSystemTestContext } from "#__tests__/filesystem.ts"
import { findingsLeft, getFailure, makeLockfileFile } from "./command-test-helpers.ts"
import { makeSelection, runLifecycle } from "./lifecycle.ts"

const PACKAGE_JSON = `{
  "name": "test-project",
  "devDependencies": { "adamantite": "1.0.0" },
  "scripts": { "check": "tsc && eslint .", "test": "vitest" }
}
`

const INIT_ARGS = ["--non-interactive", "--script", "check", "--script", "analyze"]

function makeProject(files: Record<string, string> = {}) {
  return createFileSystemTestContext({ files: { "package.json": PACKAGE_JSON, ...files } })
}

const decodeScripts = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Struct({ scripts: Schema.Record(Schema.String, Schema.String) }))
)

function readScripts(files: FileSystemTestContext) {
  return decodeScripts(files.read("package.json")).scripts
}

// A managed script is the one exception to whole files: Setup sets the selected key and overwrites
// what it held.
describe("managed scripts", () => {
  it.effect("overwrite a selected script that ran another command, and keep the others", () =>
    Effect.gen(function* () {
      const files = makeProject()
      const { exit, output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(getFailure(exit)).toStrictEqual(findingsLeft("init"))
      expect(readScripts(files)).toStrictEqual({
        analyze: "adamantite analyze",
        check: "adamantite check",
        test: "vitest",
      })
      expect(output).toContain("✔ `check` script replaced: `tsc && eslint .` → `adamantite check`.")
      expect(output).toContain("✔ `analyze` script added: `adamantite analyze`.")
    })
  )

  it.effect("leave package.json byte-identical on a second init", () =>
    Effect.gen(function* () {
      const files = makeProject()
      yield* runLifecycle("init", files, INIT_ARGS)
      const before = files.read("package.json")

      const { output } = yield* runLifecycle("init", files, INIT_ARGS)

      expect(files.read("package.json")).toBe(before)
      expect(output).toContain("● `check` script is up to date.")
      expect(output).toContain("● `analyze` script is up to date.")
    })
  )

  it.effect("set a selected script again in update after the project changed it", () =>
    Effect.gen(function* () {
      const files = makeProject(makeLockfileFile(makeSelection({ scripts: ["check"] })))

      const { output } = yield* runLifecycle("update", files)

      expect(readScripts(files)).toStrictEqual({ check: "adamantite check", test: "vitest" })
      expect(output).toContain("✔ `check` script replaced: `tsc && eslint .` → `adamantite check`.")
    })
  )
})
