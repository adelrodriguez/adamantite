import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import process from "node:process"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIRECTORY = "fixtures"

/**
 * A preset's rule fixtures live in one directory, with one directory for each plugin namespace,
 * such as `anti-slop`, and one directory for each rule in it. Files in
 * `<fixturesDir>/<namespace>/<rule>/valid/` must not get a report from the rule. Files in
 * `<fixturesDir>/<namespace>/<rule>/invalid/` must get at least one report.
 *
 * Keep one case per file, so a relaxed rule cannot hide behind another report in the same file, and
 * the file name tells which case changed.
 */
export interface RuleFixtureOptions {
  /**
   * Absolute path of the directory that holds one directory for each plugin namespace.
   */
  readonly fixturesDir: string
  /**
   * Absolute path of the preset module that loads the plugin and enables its rules.
   */
  readonly presetPath: string
}

export type RuleFixtureKind = "invalid" | "valid"

export interface RuleFixtureCase {
  /**
   * Fixture path relative to the fixtures directory, with forward slashes.
   */
  readonly file: string
  readonly kind: RuleFixtureKind
  /**
   * Lines where the rule under test reported the file.
   */
  readonly reportedLines: readonly number[]
  /**
   * The rule name as a config sets it, such as `anti-slop/no-reflect-get`.
   */
  readonly rule: string
}

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      filename: Schema.String,
      labels: Schema.Array(Schema.Struct({ span: Schema.Struct({ line: Schema.Finite }) })),
    })
  ),
})

const decodeOxlintJsonOutput = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintJsonOutput))

function listDirectory(path: string): string[] {
  try {
    return EffectArray.sort(readdirSync(path), Order.String)
  } catch {
    return []
  }
}

/**
 * List the rules that have a fixture directory, as a config names them, such as
 * `anti-slop/no-reflect-get`. Synchronous, so a test file can use the result to declare its tests.
 */
export function listFixtureRules(fixturesDir: string): string[] {
  return listDirectory(fixturesDir).flatMap((namespace) =>
    listDirectory(join(fixturesDir, namespace)).map((rule) => `${namespace}/${rule}`)
  )
}

/**
 * Lint every fixture in one real Oxlint run through the preset, and return one case per fixture
 * file with the reports of that file's own rule. The run goes through the Oxlint entry, as
 * `adamantite check` does, so a preset that needs the Effect build of Oxlint loads too.
 */
export function lintRuleFixtures(options: RuleFixtureOptions): RuleFixtureCase[] {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-rule-fixtures-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))
    cpSync(options.fixturesDir, join(tempDir, FIXTURES_DIRECTORY), { recursive: true })
    writeFileSync(
      join(tempDir, "oxlint.config.ts"),
      [
        'import { defineConfig } from "oxlint"',
        `import preset from ${JSON.stringify(options.presetPath)}`,
        "",
        "export default defineConfig({ extends: [preset] })",
        "",
      ].join("\n")
    )

    const result = spawnSync(
      process.execPath,
      [
        join(REPO_ROOT, "src/oxlint.ts"),
        "-c",
        "oxlint.config.ts",
        "-f",
        "json",
        FIXTURES_DIRECTORY,
      ],
      { cwd: tempDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
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

    const reportedLinesByFile = new Map<string, number[]>()

    for (const diagnostic of output.diagnostics) {
      const file = diagnostic.filename.split(sep).join("/")
      const lines = reportedLinesByFile.get(`${diagnostic.code}:${file}`) ?? []

      lines.push(...diagnostic.labels.map((label) => label.span.line))
      reportedLinesByFile.set(`${diagnostic.code}:${file}`, lines)
    }

    const kinds: RuleFixtureKind[] = ["valid", "invalid"]

    return listDirectory(options.fixturesDir).flatMap((namespace) =>
      listDirectory(join(options.fixturesDir, namespace)).flatMap((ruleName) =>
        kinds.flatMap((kind) =>
          listDirectory(join(options.fixturesDir, namespace, ruleName, kind)).map((name) => {
            const rule = `${namespace}/${ruleName}`
            const file = `${rule}/${kind}/${name}`
            const key = `${namespace}(${ruleName}):${FIXTURES_DIRECTORY}/${file}`

            return { file, kind, reportedLines: reportedLinesByFile.get(key) ?? [], rule }
          })
        )
      )
    )
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}

export function selectRuleFixtures(
  cases: readonly RuleFixtureCase[],
  rule: string,
  kind: RuleFixtureKind
): RuleFixtureCase[] {
  return cases.filter((entry) => entry.rule === rule && entry.kind === kind)
}
