import { spawnSync } from "node:child_process"
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative, sep } from "node:path"
import { afterAll, beforeAll, describe, expect, it } from "@effect/vitest"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../..")

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
}

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      filename: Schema.String,
      message: Schema.String,
    })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name))
    .map((entry) => relative(dir, join(entry.parentPath, entry.name)).split(sep).join("/"))
}

/**
 * One report of the rule, with the file relative to the model.
 */
export interface ModelReport {
  readonly filename: string
  readonly message: string
}

/**
 * Run Oxlint in `cwd` with the config and folders as paths relative to `cwd`, and return the
 * reports with `ruleCode`, with each file relative to `cwd`.
 */
function runOxlint(
  cwd: string,
  config: string,
  targets: readonly string[],
  ruleCode: string
): ModelReport[] {
  const result = spawnSync(
    join(REPO_ROOT, "node_modules/.bin/oxlint"),
    ["-c", config, "-f", "json", ...targets],
    { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
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

  return output.diagnostics
    .filter((diagnostic) => diagnostic.code === ruleCode)
    .map((diagnostic) => ({
      filename: diagnostic.filename.split(sep).join("/"),
      message: diagnostic.message,
    }))
}

/**
 * Lint one model in a real Oxlint run through the architecture preset, from a copy in `tempDir`,
 * and return the reports of the rule.
 */
export function lintModel(
  options: ModelFixtureOptions,
  tempDir: string,
  model: string
): ModelReport[] {
  const projectDir = join(tempDir, model)

  cpSync(join(options.fixturesDir, model), projectDir, { recursive: true })
  symlinkSync(join(REPO_ROOT, "node_modules"), join(projectDir, "node_modules"))
  writeFileSync(
    join(projectDir, "oxlint.config.ts"),
    [
      'import { defineConfig } from "oxlint"',
      `import architecture from ${JSON.stringify(join(REPO_ROOT, "presets/lint/architecture.ts"))}`,
      `import fragment from ${JSON.stringify(`./${options.configFile}`)} with { type: "json" }`,
      "",
      "export default defineConfig({ extends: [architecture], ...fragment })",
      "",
    ].join("\n")
  )

  // The model's own folders, so Oxlint does not walk the linked `node_modules`.
  const sourceDirs = readdirSync(join(options.fixturesDir, model), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)

  return runOxlint(projectDir, "oxlint.config.ts", sourceDirs, options.ruleCode)
}

/**
 * A project that a test writes, for a case that a committed fixture cannot hold, such as a symlink.
 */
export interface ProjectFixture {
  /**
   * The Oxlint config that the project adds to the architecture preset, such as its `rules`.
   */
  readonly config: object
  /**
   * The content of each file, by its path in the project.
   */
  readonly files: Readonly<Record<string, string>>
  /**
   * The target of each symlink as `ln -s` takes it, by the path of the link in the project.
   */
  readonly links: Readonly<Record<string, string>>
  /**
   * The folders that Oxlint lints, relative to the project.
   */
  readonly targets: readonly string[]
}

/**
 * Write the project in a temporary folder, lint it in a real Oxlint run through the architecture
 * preset, and return the reports of `ruleCode`, with each file relative to the project. With
 * `throughLink`, Oxlint reaches the project through a linked folder, so the paths that it lints are
 * not the real paths of the files.
 */
export function lintProject(
  ruleCode: string,
  fixture: ProjectFixture,
  { throughLink = false } = {}
): ModelReport[] {
  // The real path, so the folder that Oxlint reaches the project through is the only link above it.
  const tempDir = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-project-")))

  try {
    const projectDir = join(tempDir, "project")

    for (const [path, content] of Object.entries(fixture.files)) {
      mkdirSync(dirname(join(projectDir, path)), { recursive: true })
      writeFileSync(join(projectDir, path), content)
    }

    for (const [path, target] of Object.entries(fixture.links)) {
      mkdirSync(dirname(join(projectDir, path)), { recursive: true })
      symlinkSync(target, join(projectDir, path))
    }

    writeFileSync(
      join(projectDir, "oxlint.config.ts"),
      [
        `import architecture from ${JSON.stringify(join(REPO_ROOT, "presets/lint/architecture.ts"))}`,
        "",
        `export default { extends: [architecture], ...${JSON.stringify(fixture.config)} }`,
        "",
      ].join("\n")
    )

    const folder = throughLink ? "linked" : "project"

    if (throughLink) {
      symlinkSync(projectDir, join(tempDir, folder))
    }

    return runOxlint(
      tempDir,
      `${folder}/oxlint.config.ts`,
      fixture.targets.map((target) => `${folder}/${target}`),
      ruleCode
    ).map((report) => ({ ...report, filename: report.filename.slice(`${folder}/`.length) }))
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

/**
 * Declare the tests for each model: every invalid file is reported, and no valid file is.
 */
export function describeModelFixtures(options: ModelFixtureOptions): void {
  const models = EffectArray.sort(readdirSync(options.fixturesDir), Order.String)
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-models-"))
  const reported = new Map<string, Set<string>>()

  beforeAll(() => {
    for (const model of models) {
      const reports = lintModel(options, tempDir, model)

      reported.set(model, new Set(reports.map((report) => report.filename)))
    }
  })

  afterAll(() => {
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe.each(models)("%s", (model) => {
    const files = listSourceFiles(join(options.fixturesDir, model))

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
}
