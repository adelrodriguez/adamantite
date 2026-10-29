import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, sep } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIR = join(import.meta.dirname, "fixtures/layers")
const RULE_CODE = "adamantite(layers)"

// Each model is a small project with its own `package.json` files and a `layers.json` config
// fragment that turns on `adamantite/layers`. A source file whose name contains `.invalid.` must
// be reported at least once, and every other source file must not be reported.
const MODELS = EffectArray.sort(readdirSync(FIXTURES_DIR), Order.String)

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({ code: Schema.optional(Schema.String), filename: Schema.String })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
}

/**
 * Lint one model in a real Oxlint run through the strict preset, and return the files that
 * `adamantite/layers` reported.
 */
function lintModel(tempDir: string, model: string): Set<string> {
  const projectDir = join(tempDir, model)

  cpSync(join(FIXTURES_DIR, model), projectDir, { recursive: true })
  symlinkSync(join(REPO_ROOT, "node_modules"), join(projectDir, "node_modules"))
  writeFileSync(
    join(projectDir, "oxlint.config.ts"),
    [
      'import { defineConfig } from "oxlint"',
      `import strict from ${JSON.stringify(join(REPO_ROOT, "presets/lint/strict.ts"))}`,
      'import layers from "./layers.json" with { type: "json" }',
      "",
      "export default defineConfig({ extends: [strict], ...layers })",
      "",
    ].join("\n")
  )

  // The model's own folders, so Oxlint does not walk the linked `node_modules`.
  const sourceDirs = readdirSync(join(FIXTURES_DIR, model), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const result = spawnSync(
    join(REPO_ROOT, "node_modules/.bin/oxlint"),
    ["-c", "oxlint.config.ts", "-f", "json", ...sourceDirs],
    { cwd: projectDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  )

  if (result.error) {
    throw result.error
  }

  let output: typeof OxlintJsonOutput.Type

  try {
    output = decodeOxlintJsonOutput(result.stdout)
  } catch (error) {
    throw new Error(`Oxlint did not print JSON diagnostics.\n${result.stdout}${result.stderr}`, {
      cause: error,
    })
  }

  return new Set(
    output.diagnostics
      .filter((diagnostic) => diagnostic.code === RULE_CODE)
      .map((diagnostic) => diagnostic.filename.split(sep).join("/"))
  )
}

describe("layers rule fixtures", () => {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-layers-"))
  const reported = new Map<string, Set<string>>()

  beforeAll(() => {
    for (const model of MODELS) {
      reported.set(model, lintModel(tempDir, model))
    }
  })

  afterAll(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe.each(MODELS)("%s", (model) => {
    const files = listSourceFiles(join(FIXTURES_DIR, model))

    it("report every invalid file", () => {
      const invalid = files.filter((file) => file.includes(".invalid."))
      const missed = invalid.filter((file) => !reported.get(model)?.has(file))

      expect(invalid).not.toStrictEqual([])
      expect(missed).toStrictEqual([])
    })

    it("report no valid file", () => {
      const valid = files.filter((file) => !file.includes(".invalid."))
      const wrong = valid.filter((file) => reported.get(model)?.has(file))

      expect(valid).not.toStrictEqual([])
      expect(wrong).toStrictEqual([])
    })
  })
})
