import { spawnSync } from "node:child_process"
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, sep } from "node:path"
import process from "node:process"
import type { OxlintConfig } from "oxlint"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"
import { linkFixturePackages } from "./fixture-packages.ts"

const REPO_ROOT = join(import.meta.dirname, "../..")

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
 * The Oxlint package folder that `ADAMANTITE_TEST_OXLINT` names, when it names one.
 */
function readOxlintOverride(): string | undefined {
  const folder = process.env[OXLINT_VARIABLE]

  return folder === "" ? undefined : folder
}

const OxlintPackageJson = Schema.Struct({ version: Schema.String })
const decodeOxlintPackageJson = Schema.decodeUnknownSync(Schema.fromJsonString(OxlintPackageJson))

/**
 * The version of the Oxlint that lints the fixtures: the package that `ADAMANTITE_TEST_OXLINT`
 * names, or the Oxlint of the repository.
 */
export function readFixtureOxlintVersion(): string {
  const folder = readOxlintOverride() ?? join(REPO_ROOT, "node_modules/oxlint")

  return decodeOxlintPackageJson(readFileSync(join(folder, "package.json"), "utf8")).version
}

/**
 * A preset's rule fixtures live in one directory, with one directory for each plugin namespace,
 * such as `quality`, and one directory for each rule in it. Files in
 * `<fixturesDir>/<namespace>/<rule>/valid/` must not get a report from the rule. Files in
 * `<fixturesDir>/<namespace>/<rule>/invalid/` must get at least one report. Each rule has at least
 * one file of each kind, which `stacks.test.ts` checks.
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
export const RULE_FIXTURE_KINDS = ["invalid", "valid"] as const

export type RuleFixtureKind = (typeof RULE_FIXTURE_KINDS)[number]

export interface RuleFixture {
  /**
   * Fixture path relative to the fixtures directory, with forward slashes.
   */
  readonly file: string
  readonly kind: RuleFixtureKind
  /**
   * The rule name as a config sets it, such as `quality/no-reflect-get`.
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
  number_of_files: Schema.Int,
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
 * `quality/no-reflect-get`. Synchronous, so a test file can use the result to declare its tests.
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
   * The rule name as a config sets it, such as `quality/no-reflect-get`. A type check error has the
   * plugin `typescript` and its code, such as `typescript/TS2307`.
   */
  readonly rule: string
}

/**
 * The result of one Oxlint run on the `fixtures/` folder of a fixture project.
 */
export interface FixtureLint {
  /**
   * The number of files that Oxlint linted. A file that an ignore pattern skips is not in it.
   */
  readonly files: number
  readonly reports: FixtureReport[]
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
  const oxlint = readOxlintOverride()

  linkFixturePackages(join(project, "node_modules"))

  if (oxlint !== undefined) {
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
 * Lint the `fixtures/` folder of a fixture project in one real Oxlint run, and return each report
 * and the number of files that Oxlint linted. The run goes through the Oxlint entry, as the run of
 * an editor does, so a preset that needs the Effect build of Oxlint loads too.
 */
export function lintFixtureProject(project: string): FixtureLint {
  const result = spawnSync(
    process.execPath,
    [
      join(REPO_ROOT, "src/oxlint/index.ts"),
      "-c",
      "oxlint.config.ts",
      "-f",
      "json",
      FIXTURES_DIRECTORY,
    ],
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

  const reports = output.diagnostics.flatMap((diagnostic) => {
    const code = REPORT_CODE.exec(diagnostic.code ?? "")?.groups

    const file = diagnostic.filename
      .split(sep)
      .join("/")
      .slice(FIXTURES_DIRECTORY.length + 1)

    const rule = code === undefined ? "" : `${code["plugin"]}/${code["rule"]}`

    return diagnostic.labels.map((label) => ({ file, line: label.span.line, rule }))
  })

  return { files: output.number_of_files, reports }
}

/**
 * Lint a fixture tree in one real Oxlint run with the presets, in a fixture project, and return
 * each report.
 */
export function lintFixtureTree(options: FixtureTreeOptions): FixtureReport[] {
  const project = createFixtureProject(options)

  try {
    return lintFixtureProject(project).reports
  } finally {
    removeFixtureProject(project)
  }
}

/**
 * List each rule fixture file of the tree, with its rule and kind. Synchronous, so a test file can
 * use the result to declare its tests.
 */
export function listRuleFixtures(fixturesDir: string): RuleFixture[] {
  return listFixtureRules(fixturesDir).flatMap((rule) =>
    RULE_FIXTURE_KINDS.flatMap((kind) =>
      listDirectory(join(fixturesDir, rule, kind)).map((name) => ({
        file: `${rule}/${kind}/${name}`,
        kind,
        rule,
      }))
    )
  )
}
