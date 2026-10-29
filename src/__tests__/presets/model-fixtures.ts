import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, relative, sep } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")

const hasBun = spawnSync("bun", ["--version"]).status === 0

/**
 * The runtime that runs Oxlint, and so the rule. Bun runs only when it is installed.
 */
export type Runtime = "bun" | "node"

/**
 * A rule's model fixtures live in one directory, with one small project for each model. Each model
 * has its own `package.json` files and a JSON config fragment that turns on the rule. A source file
 * whose name contains `.invalid.` must be reported at least once, and every other source file must
 * not be reported.
 */
export interface ModelFixtureOptions {
  /**
   * File name of the config fragment in each model, such as `layers.json`.
   */
  readonly configFile: string
  /**
   * Absolute path of the directory that holds one directory per model.
   */
  readonly fixturesDir: string
  /**
   * Diagnostic code as Oxlint prints it, such as `adamantite(layers)`.
   */
  readonly ruleCode: string
  /**
   * The runtimes that lint each model. Default: Node.js only.
   */
  readonly runtimes?: readonly Runtime[]
}

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

function spawnOxlint(runtime: Runtime, args: readonly string[], cwd: string) {
  const spawnOptions = { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 } as const

  return runtime === "bun"
    ? spawnSync("bun", [join(REPO_ROOT, "node_modules/oxlint/bin/oxlint"), ...args], spawnOptions)
    : spawnSync(join(REPO_ROOT, "node_modules/.bin/oxlint"), args, spawnOptions)
}

/**
 * Lint one model in a real Oxlint run through the strict preset, and return the files that the rule
 * reported.
 */
function lintModel(
  options: ModelFixtureOptions,
  tempDir: string,
  model: string,
  runtime: Runtime
): Set<string> {
  const projectDir = join(tempDir, runtime, model)

  cpSync(join(options.fixturesDir, model), projectDir, { recursive: true })
  symlinkSync(join(REPO_ROOT, "node_modules"), join(projectDir, "node_modules"))
  writeFileSync(
    join(projectDir, "oxlint.config.ts"),
    [
      'import { defineConfig } from "oxlint"',
      `import strict from ${JSON.stringify(join(REPO_ROOT, "presets/lint/strict.ts"))}`,
      `import fragment from ${JSON.stringify(`./${options.configFile}`)} with { type: "json" }`,
      "",
      "export default defineConfig({ extends: [strict], ...fragment })",
      "",
    ].join("\n")
  )

  // The model's own folders, so Oxlint does not walk the linked `node_modules`.
  const sourceDirs = readdirSync(join(options.fixturesDir, model), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
  const result = spawnOxlint(
    runtime,
    ["-c", "oxlint.config.ts", "-f", "json", ...sourceDirs],
    projectDir
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
      .filter((diagnostic) => diagnostic.code === options.ruleCode)
      .map((diagnostic) => diagnostic.filename.split(sep).join("/"))
  )
}

/**
 * Declare the tests for each model and runtime: every invalid file is reported, and no valid file
 * is.
 */
export function describeModelFixtures(options: ModelFixtureOptions): void {
  const models = EffectArray.sort(readdirSync(options.fixturesDir), Order.String)
  const runtimes = (options.runtimes ?? ["node"]).filter((runtime) => runtime !== "bun" || hasBun)
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-models-"))
  const reported = new Map<string, Set<string>>()

  beforeAll(() => {
    for (const runtime of runtimes) {
      for (const model of models) {
        reported.set(`${runtime}/${model}`, lintModel(options, tempDir, model, runtime))
      }
    }
  })

  afterAll(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe.each(runtimes)("under %s", (runtime) => {
    describe.each(models)("%s", (model) => {
      const files = listSourceFiles(join(options.fixturesDir, model))

      it("report every invalid file", () => {
        const invalid = files.filter((file) => file.includes(".invalid."))
        const missed = invalid.filter((file) => !reported.get(`${runtime}/${model}`)?.has(file))

        expect(invalid).not.toStrictEqual([])
        expect(missed).toStrictEqual([])
      })

      it("report no valid file", () => {
        const valid = files.filter((file) => !file.includes(".invalid."))
        const wrong = valid.filter((file) => reported.get(`${runtime}/${model}`)?.has(file))

        expect(valid).not.toStrictEqual([])
        expect(wrong).toStrictEqual([])
      })
    })
  })
}
