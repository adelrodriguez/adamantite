import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const REPO_ROOT = join(import.meta.dirname, "../../..")
const FIXTURES_DIRECTORY = "fixtures"

/**
 * A plugin's rule fixtures live in one directory with this layout:
 *
 * <fixturesDir>/<rule>/valid/* files the rule must not report <fixturesDir>/<rule>/invalid/* files
 * the rule must report at least once
 *
 * Keep one case per file, so a relaxed rule cannot hide behind another report in the same file, and
 * the file name tells which case changed.
 */
export interface RuleFixtureOptions {
  /**
   * Absolute path of the directory that holds one directory per rule.
   */
  readonly fixturesDir: string
  /**
   * Plugin namespace as Oxlint prints it in diagnostic codes, such as `anti-slop`.
   */
  readonly namespace: string
  /**
   * Absolute path of the preset module that loads the plugin and enables its rules.
   */
  readonly presetPath: string
  /**
   * Absolute path of a directory whose content becomes the root of the linted project. Use it when
   * the rules read project files, such as a theme stylesheet or component modules.
   */
  readonly projectDir?: string
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
  readonly rule: string
}

const OxlintJsonOutput = Schema.Struct({
  diagnostics: Schema.Array(
    Schema.Struct({
      code: Schema.optional(Schema.String),
      filename: Schema.String,
      labels: Schema.Array(Schema.Struct({ span: Schema.Struct({ line: Schema.Number }) })),
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
 * List the rules that have a fixture directory. Synchronous, so a test file can use the result to
 * declare its tests.
 */
export function listFixtureRules(fixturesDir: string): string[] {
  return listDirectory(fixturesDir)
}

/**
 * Lint every fixture in one real Oxlint run through the preset, and return one case per fixture
 * file with the reports of that file's own rule.
 */
export function lintRuleFixtures(options: RuleFixtureOptions): RuleFixtureCase[] {
  const tempDir = mkdtempSync(join(tmpdir(), "adamantite-rule-fixtures-"))

  try {
    symlinkSync(join(REPO_ROOT, "node_modules"), join(tempDir, "node_modules"))

    if (options.projectDir !== undefined) {
      cpSync(options.projectDir, tempDir, { recursive: true })
    }

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
      join(REPO_ROOT, "node_modules/.bin/oxlint"),
      ["-c", "oxlint.config.ts", "-f", "json", FIXTURES_DIRECTORY],
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

    return listFixtureRules(options.fixturesDir).flatMap((rule) =>
      kinds.flatMap((kind) =>
        listDirectory(join(options.fixturesDir, rule, kind)).map((name) => {
          const file = `${rule}/${kind}/${name}`
          const key = `${options.namespace}(${rule}):${FIXTURES_DIRECTORY}/${file}`

          return { file, kind, reportedLines: reportedLinesByFile.get(key) ?? [], rule }
        })
      )
    )
  } finally {
    rmSync(tempDir, { force: true, recursive: true })
  }
}
