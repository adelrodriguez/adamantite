import { spawnSync } from "node:child_process"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const ANALYZE_PRESET = join(REPO_ROOT, "presets/analyze.ts")

const KnipJsonOutput = Schema.Struct({
  issues: Schema.Array(
    Schema.Struct({
      file: Schema.String,
      files: Schema.optional(Schema.Array(Schema.Unknown)),
    })
  ),
})

const decodeKnipJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(KnipJsonOutput))

const RULE = "export default { create: () => ({}) }\n"

describe("analyze preset", () => {
  let project: string

  function write(path: string, content: string) {
    mkdirSync(dirname(join(project, path)), { recursive: true })
    writeFileSync(join(project, path), content)
  }

  function findUnusedFiles() {
    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/knip"),
      ["--include", "files", "--reporter", "json", "--no-progress"],
      { cwd: project, encoding: "utf8" }
    )

    try {
      const unused = decodeKnipJsonOutput(result.stdout)
        .issues.filter((issue) => (issue.files?.length ?? 0) > 0)
        .map((issue) => issue.file)

      return EffectArray.sort(unused, Order.String)
    } catch (error) {
      throw new Error(`Knip did not print a JSON report.\n${result.stdout}${result.stderr}`, {
        cause: error,
      })
    }
  }

  beforeEach(() => {
    project = mkdtempSync(join(tmpdir(), "adamantite-analyze-"))
    write("package.json", JSON.stringify({ name: "fixture", private: true, type: "module" }))
    write("knip.config.ts", `export { default } from ${JSON.stringify(ANALYZE_PRESET)}\n`)
    write("src/index.ts", "export const value = 1\n")
  })

  afterEach(() => {
    rmSync(project, { force: true, recursive: true })
  })

  it("keep rule files, rule tests, and their helpers in the rules folder", () => {
    write(".adamantite/rules/_shared.ts", "export const message = 'No foo.'\n")
    write(
      ".adamantite/rules/no-foo.ts",
      `import { message } from "./_shared.ts"\n\nexport default { create: () => ({}), message }\n`
    )
    write(".adamantite/rules/no-bar.mjs", RULE)
    write(".adamantite/rules/tests/no-foo.ts", 'import rule from "../no-foo.ts"\n\nvoid rule\n')
    write("src/unused.ts", "export const unused = 1\n")

    expect(findUnusedFiles()).toStrictEqual(["src/unused.ts"])
  })

  it("report a helper in the rules folder that no file imports", () => {
    write(".adamantite/rules/no-foo.ts", RULE)
    write(".adamantite/rules/_unused.ts", "export const unused = 1\n")
    write(".adamantite/rules/tests/_unused.ts", "export const unused = 1\n")

    expect(findUnusedFiles()).toStrictEqual([
      ".adamantite/rules/_unused.ts",
      ".adamantite/rules/tests/_unused.ts",
    ])
  })

  it("keep the rule files of each workspace package", () => {
    write(
      "package.json",
      JSON.stringify({ name: "fixture", private: true, type: "module", workspaces: ["packages/*"] })
    )
    write(".adamantite/rules/no-foo.ts", RULE)
    write("packages/web/package.json", JSON.stringify({ name: "web", type: "module" }))
    write("packages/web/src/index.ts", "export const value = 1\n")
    write("packages/web/.adamantite/rules/no-bar.ts", RULE)

    expect(findUnusedFiles()).toStrictEqual([])
  })
})
