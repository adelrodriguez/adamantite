import { spawnSync } from "node:child_process"
import { cpSync, mkdtempSync, readdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import process from "node:process"
import type { OxlintConfig } from "oxlint"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { linkFixturePackages } from "./fixture-packages.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

/**
 * The folder of a fixture project that holds the copy of the fixture tree.
 */
export const FIXTURES_DIRECTORY = "fixtures"

/**
 * The variable that names an Oxlint package folder, such as `<folder>/node_modules/oxlint`, that
 * replaces the Oxlint of the repository in the fixture runs. `vitest.config.ts` reads the same
 * variable for the RuleTester tests. CI sets it to test the rules with the minimum Oxlint version
 * that `peerDependencies` allows.
 */
const OXLINT_VARIABLE = "ADAMANTITE_TEST_OXLINT"

/**
 * A preset's rule fixtures live in one directory, with one directory for each plugin namespace,
 * such as `antislop`, and one directory for each rule in it. Files in
 * `<fixturesDir>/<namespace>/<rule>/valid/` must not get a report from the rule. Files in
 * `<fixturesDir>/<namespace>/<rule>/invalid/` must get at least one report.
 *
 * Keep one case per file, so a relaxed rule cannot hide behind another report in the same file, and
 * the file name tells which case changed.
 *
 * A valid fixture is code that a target project can keep: `stacks.test.ts` lints each tree with
 * each stack of its preset, and no rule of the stack can report a valid fixture. A case that some
 * other rule always reports belongs in the RuleTester test of the rule. Files in
 * `<fixturesDir>/<namespace>/<rule>/modules/` are the modules that the fixtures import, such as a
 * module that stands for a package. No test reads their reports.
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

export interface RuleFixture {
  /**
   * Fixture path relative to the fixtures directory, with forward slashes.
   */
  readonly file: string
  readonly kind: RuleFixtureKind
  /**
   * The rule name as a config sets it, such as `antislop/no-reflect-get`.
   */
  readonly rule: string
}

export interface RuleFixtureCase extends RuleFixture {
  /**
   * Lines where the rule under test reported the file.
   */
  readonly reportedLines: readonly number[]
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
 * `antislop/no-reflect-get`. Synchronous, so a test file can use the result to declare its tests.
 */
export function listFixtureRules(fixturesDir: string): string[] {
  return listDirectory(fixturesDir).flatMap((namespace) =>
    listDirectory(join(fixturesDir, namespace)).map((rule) => `${namespace}/${rule}`)
  )
}

/**
 * A fixture tree and the config that lints it.
 */
export interface FixtureTreeOptions {
  /**
   * The unstable Effect modules that the tsconfig of the tree allows, as a target project lists
   * them for `effecttsgo/unstable-api-usage`.
   */
  readonly allowedUnstableApis?: readonly string[]
  /**
   * Absolute path of the directory to lint.
   */
  readonly fixturesDir: string
  /**
   * The `options` of the config. Without it, Oxlint runs no type-aware rule of a built-in plugin.
   */
  readonly options?: OxlintConfig["options"]
  /**
   * Absolute paths of the preset modules, in the order of `extends`.
   */
  readonly presets: readonly string[]
}

export interface FixtureReport {
  /**
   * Fixture path relative to the fixtures directory, with forward slashes.
   */
  readonly file: string
  readonly line: number
  /**
   * The rule name as a config sets it, such as `antislop/no-reflect-get`. A type check error has
   * the plugin `typescript` and its code, such as `typescript/TS2307`.
   */
  readonly rule: string
}

const REPORT_CODE = /^(?<plugin>[^(]+)\((?<rule>.+)\)$/

const FORMAT_PRESET = join(REPO_ROOT, "presets/format.ts")

/**
 * Write a temporary project that holds a copy of the fixture tree in `fixtures/`, and return its
 * path. The project links the packages of the repository and the fixture packages, and its
 * `oxlint.config.ts` and `oxfmt.config.ts` extend the presets, so `adamantite check` and
 * `adamantite fix` run in it as in a target project. The tree is in the `include` of a tsconfig
 * that extends the Adamantite preset and has the plugin entry of the Effect rules. The fixture
 * packages supply the types of the packages that the fixtures import, such as the JSX types of
 * React. Remove the project with `removeFixtureProject`.
 */
export function createFixtureProject(options: FixtureTreeOptions): string {
  const project = mkdtempSync(join(tmpdir(), "adamantite-fixtures-"))
  const oxlint = process.env[OXLINT_VARIABLE]

  linkFixturePackages(join(project, "node_modules"))

  if (oxlint !== undefined && oxlint !== "") {
    // Take Oxlint from the named folder instead of the repository.
    rmSync(join(project, "node_modules/oxlint"))
    symlinkSync(oxlint, join(project, "node_modules/oxlint"))
  }

  cpSync(options.fixturesDir, join(project, FIXTURES_DIRECTORY), { recursive: true })
  writeFileSync(
    join(project, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        jsx: "react-jsx",
        plugins: [
          {
            allowedUnstableApis: options.allowedUnstableApis ?? [],
            diagnostics: true,
            name: "@effect/language-service",
          },
        ],
        types: ["node"],
      },
      extends: join(REPO_ROOT, "presets/tsconfig.json"),
      include: [FIXTURES_DIRECTORY],
    })
  )
  writeFileSync(
    join(project, "oxlint.config.ts"),
    [
      'import { defineConfig } from "oxlint"',
      ...options.presets.map(
        (preset, index) => `import preset${index} from ${JSON.stringify(preset)}`
      ),
      "",
      "export default defineConfig({",
      `  extends: [${options.presets.map((_, index) => `preset${index}`).join(", ")}],`,
      `  options: ${JSON.stringify(options.options ?? {})},`,
      "})",
      "",
    ].join("\n")
  )
  writeFileSync(
    join(project, "oxfmt.config.ts"),
    `import format from ${JSON.stringify(FORMAT_PRESET)}\n\nexport default format\n`
  )

  return project
}

export function removeFixtureProject(project: string): void {
  rmSync(project, { force: true, recursive: true })
}

/**
 * Lint the `fixtures/` folder of a fixture project in one real Oxlint run, and return each report.
 * The run goes through the Oxlint entry, as `adamantite check` does, so a preset that needs the
 * Effect build of Oxlint loads too.
 */
export function lintFixtureProject(project: string): FixtureReport[] {
  const result = spawnSync(
    process.execPath,
    [join(REPO_ROOT, "src/oxlint.ts"), "-c", "oxlint.config.ts", "-f", "json", FIXTURES_DIRECTORY],
    { cwd: project, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
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

  return output.diagnostics.flatMap((diagnostic) => {
    const code = REPORT_CODE.exec(diagnostic.code ?? "")?.groups

    const file = diagnostic.filename
      .split(sep)
      .join("/")
      .slice(FIXTURES_DIRECTORY.length + 1)

    const rule = code === undefined ? "" : `${code["plugin"]}/${code["rule"]}`

    return diagnostic.labels.map((label) => ({ file, line: label.span.line, rule }))
  })
}

/**
 * Lint a fixture tree in one real Oxlint run with the presets, in a fixture project, and return
 * each report.
 */
export function lintFixtureTree(options: FixtureTreeOptions): FixtureReport[] {
  const project = createFixtureProject(options)

  try {
    return lintFixtureProject(project)
  } finally {
    removeFixtureProject(project)
  }
}

/**
 * List each rule fixture file of the tree, with its rule and kind. Synchronous, so a test file can
 * use the result to declare its tests.
 */
export function listRuleFixtures(fixturesDir: string): RuleFixture[] {
  const kinds: RuleFixtureKind[] = ["valid", "invalid"]

  return listFixtureRules(fixturesDir).flatMap((rule) =>
    kinds.flatMap((kind) =>
      listDirectory(join(fixturesDir, rule, kind)).map((name) => ({
        file: `${rule}/${kind}/${name}`,
        kind,
        rule,
      }))
    )
  )
}

/**
 * Lint every fixture in one real Oxlint run through the preset, and return one case per fixture
 * file with the reports of that file's own rule.
 */
export function lintRuleFixtures(options: RuleFixtureOptions): RuleFixtureCase[] {
  const reports = lintFixtureTree({
    fixturesDir: options.fixturesDir,
    presets: [options.presetPath],
  })

  return listRuleFixtures(options.fixturesDir).map((fixture) => ({
    file: fixture.file,
    kind: fixture.kind,
    reportedLines: reports
      .filter((report) => report.file === fixture.file && report.rule === fixture.rule)
      .map((report) => report.line),
    rule: fixture.rule,
  }))
}

export function selectRuleFixtures(
  cases: readonly RuleFixtureCase[],
  rule: string,
  kind: RuleFixtureKind
): RuleFixtureCase[] {
  return cases.filter((entry) => entry.rule === rule && entry.kind === kind)
}
