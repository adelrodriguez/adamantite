/**
 * Test the presets with the newest versions of Oxlint, the managed plugins, the type-aware backend,
 * and the libraries that the fixtures import. The weekly workflow `.github/workflows/latest.yml`
 * runs it.
 *
 * `run` makes a temporary git worktree of `HEAD`, so it changes no file of the checkout and makes
 * no commit. It runs `pnpm run test:presets` with the locked versions, updates the packages, runs
 * the same command on the same fixture files again, and writes `report.json` and `report.md`.
 *
 * `publish` reads the report. On a failure it comments on the open issue with the same fingerprint,
 * or opens one issue when there is none. On a pass it does nothing.
 *
 * ```sh
 * node scripts/test-latest.ts run --out <folder> [--override <package>@<version>]...
 * node scripts/test-latest.ts publish --out <folder> --repo <owner/name> [--dry-run]
 * ```
 */
import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs"
import { arch, release, tmpdir, type } from "node:os"
import { join } from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Schema from "effect/Schema"

const repoRoot = join(import.meta.dirname, "..")
const FIXTURE_PACKAGES = "src/__tests__/presets/fixture-packages"

// The reporter of the checkout that runs this script, not the reporter of the tested commit.
const REPORTER = join(import.meta.dirname, "latest-reporter.ts")
const LOCKFILES = ["pnpm-lock.yaml", `${FIXTURE_PACKAGES}/pnpm-lock.yaml`]

/**
 * The root packages that a new release can break the presets with: Oxlint, the managed plugins, the
 * type-aware backend, and the packages that the fixtures import from the root, with the packages
 * that must keep the same version as one of them. The run also updates every fixture package.
 */
const ROOT_PACKAGES = [
  "oxlint",
  "@oxlint/plugins",
  "oxlint-plugin-react-doctor",
  "@shadcn/lint",
  "tsrs",
  "@effect/tsgo",
  "typescript",
  "effect",
  "@effect/platform-node",
  "@effect/platform-node-shared",
  "@effect/vitest",
  "vitest",
  "@vitest/coverage-v8",
  "@vitest/ui",
]

/**
 * The marker that `publish` writes into an issue body, and looks for in the open issues.
 */
const FINGERPRINT_MARKER = "adamantite-latest-fingerprint"

const ISSUE_LABELS = ["automated", "dependencies", "needs-triage"]

// GitHub rejects an issue body or a comment longer than 65,536 characters.
const MAX_BODY = 60_000
const MAX_DIAGNOSTIC = 6000

// --- Report ---

const Outcome = Schema.Literals([
  "pass",
  "baseline-failure",
  "install-failure",
  "process-failure",
  "regression",
])

type Outcome = typeof Outcome.Type

const Step = Schema.Struct({
  command: Schema.String,
  durationMs: Schema.Finite,
  exitCode: Schema.NullOr(Schema.Int),
  log: Schema.String,
  name: Schema.String,
})

type Step = typeof Step.Type

const Failure = Schema.Struct({
  /**
   * The full failure message of Vitest, with the diff of the reports.
   */
  diagnostic: Schema.String,
  /**
   * The fixture files that the message names.
   */
  fixtures: Schema.Array(Schema.String),
  /**
   * The test file and the full test name, such as `src/__tests__/presets/stacks.test.ts > strict
   * stack lint each valid fixture clean`.
   */
  id: Schema.String,
  /**
   * The rule IDs that the message names, such as `promise/valid-params`.
   */
  rules: Schema.Array(Schema.String),
  /**
   * The status in the candidate run. `missing` is a test that the baseline run passed and the
   * candidate run did not run.
   */
  status: Schema.String,
})

type Failure = typeof Failure.Type

const Report = Schema.Struct({
  baselineVersions: Schema.Record(Schema.String, Schema.String),
  candidateVersions: Schema.Record(Schema.String, Schema.String),
  commit: Schema.String,
  /**
   * The end of the output of the step that failed, when no test result explains the failure.
   */
  failedOutput: Schema.NullOr(Schema.String),
  failures: Schema.Array(Failure),
  fingerprint: Schema.String,
  lockfileChanges: Schema.String,
  outcome: Outcome,
  overrides: Schema.Array(Schema.String),
  runUrl: Schema.NullOr(Schema.String),
  runtime: Schema.Struct({ node: Schema.String, os: Schema.String, pnpm: Schema.String }),
  skipped: Schema.Array(Schema.String),
  steps: Schema.Array(Step),
})

type Report = typeof Report.Type

const decodeReport = Schema.decodeSync(Schema.fromJsonString(Report))

/**
 * A test or a test module in the results file of `scripts/latest-reporter.ts`.
 */
const ReportedResult = Schema.Struct({
  errors: Schema.Array(Schema.String),
  id: Schema.String,
  state: Schema.String,
})

const LatestResults = Schema.Struct({
  modules: Schema.Array(ReportedResult),
  tests: Schema.Array(Schema.Struct({ ...ReportedResult.fields, module: Schema.String })),
})

const decodeLatestResults = Schema.decodeSync(Schema.fromJsonString(LatestResults))

const PackageJson = Schema.Struct({
  dependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  devDependencies: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
  version: Schema.optionalKey(Schema.String),
})

const decodePackageJson = Schema.decodeSync(Schema.fromJsonString(PackageJson))

const OpenIssues = Schema.Array(Schema.Struct({ body: Schema.String, number: Schema.Int }))

const decodeOpenIssues = Schema.decodeSync(Schema.fromJsonString(OpenIssues))

const TITLES: Record<Exclude<Outcome, "pass">, string> = {
  "baseline-failure": "The preset tests fail with the locked versions",
  "install-failure": "The newest versions of the preset packages do not install",
  "process-failure": "The preset tests do not finish with the newest versions",
  regression: "The newest versions of the preset packages fail the preset tests",
}

const SUMMARIES: Record<Outcome, string> = {
  "baseline-failure":
    "The preset tests fail with the locked versions, so the run did not test the newest versions. Fix `main` first.",
  "install-failure": "pnpm could not install the newest versions.",
  pass: "The preset tests pass with the newest versions.",
  "process-failure":
    "The candidate run did not finish with a test result. A crash, a timeout, or a failed fixture install can cause this.",
  regression:
    "Tests that pass with the locked versions fail, skip, or do not run with the newest versions.",
}

// --- Commands ---

/**
 * Run a command, write its output to `<out>/<name>.log`, and return the step.
 */
function runStep(
  name: string,
  command: string,
  args: string[],
  options: { readonly cwd: string; readonly env: Record<string, string>; readonly out: string }
): Step {
  const start = performance.now()
  // Color codes would fill the logs and the issue. Vitest prints color whenever FORCE_COLOR is set.
  const { FORCE_COLOR: _forceColor, ...env } = process.env

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...env, NO_COLOR: "1", ...options.env },
    maxBuffer: 64 * 1024 * 1024,
    timeout: 20 * 60 * 1000,
  })

  const log = `${name}.log`
  const error = result.error === undefined ? "" : `\n--- error ---\n${result.error.message}\n`

  writeFileSync(join(options.out, log), `${result.stdout}${result.stderr}${error}`)
  console.info(`${name}: exit ${result.status ?? "none"}`)

  return {
    command: [
      ...Object.entries(options.env).map(([key, value]) => `${key}=${value}`),
      command,
      ...args,
    ].join(" "),
    durationMs: Math.round(performance.now() - start),
    exitCode: result.status,
    log,
    name,
  }
}

function read(command: string, args: string[], cwd = repoRoot): string {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })

  if (result.error !== undefined || result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.\n${result.stdout}${result.stderr}`, {
      cause: result.error,
    })
  }

  return result.stdout
}

function readPackageJson(path: string) {
  return decodePackageJson(readFileSync(path, "utf8"))
}

/**
 * The installed version of each tested package: the root packages and every fixture package.
 */
function readVersions(worktree: string): Record<string, string> {
  const fixtures = readPackageJson(join(worktree, FIXTURE_PACKAGES, "package.json"))

  const installed = (folder: string, name: string) => {
    const manifest = join(folder, "node_modules", name, "package.json")

    return existsSync(manifest) ? (readPackageJson(manifest).version ?? "unknown") : "missing"
  }

  return Object.fromEntries([
    ...ROOT_PACKAGES.map((name): [string, string] => [name, installed(worktree, name)]),
    ...Object.keys(fixtures.dependencies ?? {}).map((name): [string, string] => [
      name,
      installed(join(worktree, FIXTURE_PACKAGES), name),
    ]),
  ])
}

/**
 * The `pnpm add` arguments that replace the newest version of a package with a chosen one, in the
 * manifest and the dependency group that list the package.
 */
function toOverrideArgs(worktree: string, spec: string): string[] {
  const at = spec.lastIndexOf("@")
  const name = at > 0 ? spec.slice(0, at) : ""

  if (name === "" || at === spec.length - 1) {
    throw new Error(`Expected --override <package>@<version>, not ${spec}`)
  }

  const root = readPackageJson(join(worktree, "package.json"))
  const fixtures = readPackageJson(join(worktree, FIXTURE_PACKAGES, "package.json"))

  if (fixtures.dependencies?.[name] !== undefined) {
    return ["--dir", FIXTURE_PACKAGES, "add", "--save-exact", spec]
  }

  if (root.dependencies?.[name] !== undefined) {
    return ["add", "--save-exact", "--save-prod", spec]
  }

  if (root.devDependencies?.[name] !== undefined) {
    return ["add", "--save-exact", "--save-dev", spec]
  }

  throw new Error(`--override ${spec} names a package that no manifest lists.`)
}

// --- Test results ---

type ReportedTest = (typeof LatestResults.Type)["tests"][number]

interface TestRun {
  /**
   * The errors of each test module that failed to load or failed in a hook, keyed by module ID.
   */
  readonly failedModules: ReadonlyMap<string, readonly string[]>
  readonly tests: ReadonlyMap<string, ReportedTest>
}

function readTestRun(path: string): TestRun | undefined {
  if (!existsSync(path)) {
    return undefined
  }

  const results = decodeLatestResults(readFileSync(path, "utf8"))

  return {
    failedModules: new Map(
      results.modules.flatMap((module) =>
        module.errors.length > 0 ? [[module.id, module.errors] as const] : []
      )
    ),
    tests: new Map(results.tests.map((test) => [test.id, test])),
  }
}

const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "g")

// The fixture tests print a report as an object, `{ "file": "a.ts", "rule": "plugin/rule" }`, or
// as a string, `"a.ts plugin/rule"`.
const FIXTURE = String.raw`[\w./@-]+\.(?:[cm]?[jt]sx?|vue)`
const RULE = String.raw`[\w@-]+/[\w-]+`
const RULE_FIELD = new RegExp(String.raw`"rule": "(?<rule>${RULE})"`, "g")
const FIXTURE_STRING = new RegExp(String.raw`"(?<fixture>${FIXTURE})"`, "g")
const REPORT_STRING = new RegExp(String.raw`"(?<fixture>${FIXTURE}) (?<rule>${RULE})"`, "g")

function matchAll(text: string, group: "fixture" | "rule", patterns: readonly RegExp[]): string[] {
  const matches = patterns.flatMap((pattern) =>
    Array.from(text.matchAll(pattern), (match) => match.groups?.[group] ?? "")
  )

  return EffectArray.sort(new Set(matches), Order.String)
}

function toFailure(id: string, status: string, messages: readonly string[]): Failure {
  const diagnostic = messages.join("\n\n").replaceAll(ANSI, "")

  return {
    diagnostic,
    fixtures: matchAll(diagnostic, "fixture", [FIXTURE_STRING, REPORT_STRING]),
    id,
    rules: matchAll(diagnostic, "rule", [RULE_FIELD, REPORT_STRING]),
    status,
  }
}

/**
 * The test modules that failed and the tests that failed in a run. A skipped test is not a failure,
 * because the environment can skip a test, such as a Bun test on a machine without Bun.
 */
function listFailures(run: TestRun): Failure[] {
  return [
    ...Array.from(run.failedModules, ([id, errors]) => toFailure(id, "failed", errors)),
    ...[...run.tests.values()].flatMap((test) =>
      test.state === "failed" ? [toFailure(test.id, test.state, test.errors)] : []
    ),
  ]
}

/**
 * The failures of the candidate run, and the tests that pass in the baseline run and skip or do not
 * run in the candidate run. The baseline passed, so a test that only the candidate skips, such as a
 * fixture without its type check, is a failure too. The tests of a module that failed to load are
 * in the failure of the module.
 */
function listRegressions(baseline: TestRun, candidate: TestRun): Failure[] {
  const lost = [...baseline.tests.values()].flatMap((test) => {
    const state = candidate.tests.get(test.id)?.state ?? "missing"

    return test.state === "passed"
      && state !== "passed"
      && state !== "failed"
      && !candidate.failedModules.has(test.module)
      ? [toFailure(test.id, state, [])]
      : []
  })

  return EffectArray.sort(
    [...listFailures(candidate), ...lost],
    Order.mapInput(Order.String, (failure: Failure) => failure.id)
  )
}

function isSkipped(test: ReportedTest | undefined): boolean {
  return test?.state === "skipped" || test?.state === "pending"
}

/**
 * The tests that each run skipped. The environment skips them, so they are not failures.
 */
function listSkipped(runs: ReadonlyArray<TestRun | undefined>): string[] {
  const [first, ...rest] = runs.filter((run) => run !== undefined)

  const skipped = [...(first?.tests.values() ?? [])].flatMap((test) =>
    isSkipped(test) && rest.every((run) => isSkipped(run.tests.get(test.id))) ? [test.id] : []
  )

  return EffectArray.sort(skipped, Order.String)
}

/**
 * The identity of a failure. It holds the outcome and what failed, and no version, so a failure
 * that repeats with a newer patch release keeps one issue, and a different failure gets its own.
 */
function toFingerprint(outcome: Outcome, failures: readonly Failure[], logs: string): string {
  const errorCodes = EffectArray.sort(
    new Set(Array.from(logs.matchAll(/\b(?:ERR_PNPM_[A-Z_]+|[A-Z][A-Za-z]*Error)\b/g), String)),
    Order.String
  )

  const identity =
    failures.length === 0
      ? [outcome, errorCodes]
      : [
          outcome,
          failures.map((failure) => failure.id),
          EffectArray.sort(new Set(failures.flatMap((failure) => failure.rules)), Order.String),
        ]

  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16)
}

interface Classification {
  readonly failures: Failure[]
  readonly outcome: Outcome
}

interface RunResults {
  readonly baseline: TestRun | undefined
  readonly baselinePassed: boolean
  readonly candidate: TestRun | undefined
  readonly candidatePassed: boolean
  /**
   * The update and every override installed.
   */
  readonly updated: boolean
}

/**
 * Separate a preset regression from a failure of `main`, of the install, or of the test process.
 * The run attributes a failure to the newest versions only after the baseline passes.
 */
function classify(results: RunResults): Classification {
  const { baseline, candidate } = results

  if (!results.baselinePassed) {
    return {
      failures: baseline === undefined ? [] : listFailures(baseline),
      outcome: "baseline-failure",
    }
  }

  if (!results.updated) {
    return { failures: [], outcome: "install-failure" }
  }

  // Vitest wrote no result, so it did not finish.
  if (baseline === undefined || candidate === undefined) {
    return { failures: [], outcome: "process-failure" }
  }

  const failures = listRegressions(baseline, candidate)

  // No test ran, so the test process broke, not a preset. A test module that cannot load its
  // imports, such as after a major release of a library that the tests import, does this.
  if (![...candidate.tests.values()].some((test) => test.state === "passed")) {
    return { failures, outcome: "process-failure" }
  }

  if (failures.length > 0) {
    return { failures, outcome: "regression" }
  }

  // Every test passed, but Vitest failed, such as for an unhandled error.
  return { failures, outcome: results.candidatePassed ? "pass" : "process-failure" }
}

// --- Markdown ---

function fence(text: string, language = ""): string {
  const ticks = "`".repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length + 1)))

  return `${ticks}${language}\n${text.trimEnd()}\n${ticks}`
}

function truncate(text: string, limit: number): string {
  return text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n… ${text.length - limit} more characters in the run artifacts`
}

function toMarkdown(report: Report): string {
  const names = EffectArray.sort(Object.keys(report.candidateVersions), Order.String)

  const changed = names.filter(
    (name) => report.baselineVersions[name] !== report.candidateVersions[name]
  )

  const versionRows = changed.map(
    (name) =>
      `| \`${name}\` | ${report.baselineVersions[name] ?? "none"} | ${report.candidateVersions[name] ?? "none"} |`
  )

  const failures = report.failures.map((failure) =>
    [
      `### \`${failure.id}\``,
      "",
      `- Status: ${failure.status}`,
      `- Fixtures: ${failure.fixtures.map((file) => `\`${file}\``).join(", ") || "none named"}`,
      `- Rules: ${failure.rules.map((rule) => `\`${rule}\``).join(", ") || "none named"}`,
      "",
      fence(truncate(failure.diagnostic || "Vitest gave no failure message.", MAX_DIAGNOSTIC)),
      "",
    ].join("\n")
  )

  const failedStep = report.steps.find((step) => step.exitCode !== 0)

  return [
    `**Result:** \`${report.outcome}\`. ${SUMMARIES[report.outcome]}`,
    "",
    report.runUrl === null ? "" : `Run and artifacts: ${report.runUrl}`,
    report.overrides.length === 0
      ? ""
      : `Overrides: ${report.overrides.map((spec) => `\`${spec}\``).join(", ")}`,
    "",
    "## Changed versions",
    "",
    changed.length === 0
      ? "No version changed."
      : ["| Package | Baseline | Candidate |", "| --- | --- | --- |", ...versionRows].join("\n"),
    "",
    ...(failures.length === 0 ? [] : ["## Failing tests", "", ...failures, ""]),
    ...(report.failedOutput === null
      ? []
      : [
          `## End of the output of \`${failedStep?.name ?? "the failed step"}\``,
          "",
          fence(report.failedOutput),
          "",
        ]),
    "## Lockfile changes",
    "",
    fence(report.lockfileChanges || "No lockfile changed."),
    "",
    "## Environment",
    "",
    "| Commit | Node.js | pnpm | OS |",
    "| --- | --- | --- | --- |",
    `| ${report.commit} | ${report.runtime.node} | ${report.runtime.pnpm} | ${report.runtime.os} |`,
    "",
    "## Commands",
    "",
    "| Step | Command | Exit code | Duration |",
    "| --- | --- | --- | --- |",
    ...report.steps.map(
      (step) =>
        `| ${step.name} | \`${step.command}\` | ${step.exitCode ?? "none"} | ${(step.durationMs / 1000).toFixed(1)} s |`
    ),
    "",
    report.skipped.length === 0
      ? ""
      : `${report.skipped.length} tests skipped in the candidate run and in the baseline run. The environment skips them, so they are not failures.`,
  ]
    .join("\n")
    .replaceAll(/\n{3,}/g, "\n\n")
}

// --- run ---

function runLatest(out: string, overrides: readonly string[]): Outcome {
  mkdirSync(out, { recursive: true })

  const commit = read("git", ["rev-parse", "HEAD"]).trim()
  // The real path, so that each path that a test prints starts with the worktree, also where the
  // temporary folder is a symbolic link, as on macOS.
  const worktree = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-latest-")))
  const steps: Step[] = []

  const step = (
    name: string,
    command: string,
    args: string[],
    env: Record<string, string> = {}
  ) => {
    const result = runStep(name, command, args, { cwd: worktree, env, out })

    steps.push(result)

    return result.exitCode === 0
  }

  const testPresets = (name: "baseline" | "candidate") =>
    step(name, "pnpm", ["run", "test:presets", "--reporter=default", `--reporter=${REPORTER}`], {
      ADAMANTITE_LATEST_RESULTS: join(out, `${name}.results.json`),
    })

  read("git", ["worktree", "add", "--detach", worktree, commit])

  try {
    // The fixture packages install here, not in the `globalSetup` of the tests, so the report has
    // their versions, and a failed install is not a test failure.
    const baselineInstalled =
      step("baseline-install", "pnpm", ["install", "--frozen-lockfile"])
      && step("baseline-install-fixtures", "pnpm", [
        "--dir",
        FIXTURE_PACKAGES,
        "install",
        "--frozen-lockfile",
      ])

    const baselineVersions = baselineInstalled ? readVersions(worktree) : {}
    const baselinePassed = baselineInstalled && testPresets("baseline")
    const baseline = readTestRun(join(out, "baseline.results.json"))

    const updated =
      baselinePassed
      && step("update-root", "pnpm", ["update", "--latest", ...ROOT_PACKAGES])
      && step("update-fixtures", "pnpm", ["--dir", FIXTURE_PACKAGES, "update", "--latest"])
      && overrides.every((spec, index) =>
        step(`override-${index + 1}`, "pnpm", toOverrideArgs(worktree, spec))
      )

    const candidateVersions = baselinePassed ? readVersions(worktree) : baselineVersions
    const lockfileChanges = read("git", ["diff", "--stat", "--", ...LOCKFILES], worktree)

    writeFileSync(join(out, "lockfiles.diff"), read("git", ["diff", "--", ...LOCKFILES], worktree))

    const candidatePassed = updated && testPresets("candidate")
    const candidate = updated ? readTestRun(join(out, "candidate.results.json")) : undefined

    const { failures, outcome } = classify({
      baseline,
      baselinePassed,
      candidate,
      candidatePassed,
      updated,
    })

    const failedLogs = steps.flatMap((entry) =>
      entry.exitCode === 0 ? [] : [readFileSync(join(out, entry.log), "utf8")]
    )

    const report: Report = {
      baselineVersions,
      candidateVersions,
      commit,
      failedOutput:
        failures.length === 0 && failedLogs.length > 0
          ? (failedLogs.at(-1) ?? "").slice(-MAX_DIAGNOSTIC)
          : null,
      failures,
      fingerprint: toFingerprint(outcome, failures, failedLogs.join("\n")),
      lockfileChanges,
      outcome,
      overrides,
      runUrl:
        process.env["GITHUB_RUN_ID"] === undefined
          ? null
          : `${process.env["GITHUB_SERVER_URL"]}/${process.env["GITHUB_REPOSITORY"]}/actions/runs/${process.env["GITHUB_RUN_ID"]}`,
      runtime: {
        node: process.version,
        os: `${type()} ${release()} ${arch()}`,
        pnpm: read("pnpm", ["--version"]).trim(),
      },
      skipped: listSkipped([baseline, candidate]),
      steps,
    }

    writeFileSync(join(out, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(join(out, "report.md"), `${toMarkdown(report)}\n`)
    console.info(`${outcome}: report written to ${join(out, "report.md")}`)

    return outcome
  } finally {
    read("git", ["worktree", "remove", "--force", worktree])
  }
}

// --- publish ---

function publishLatest(out: string, repo: string, dryRun: boolean): void {
  const report = decodeReport(readFileSync(join(out, "report.json"), "utf8"))

  if (report.outcome === "pass") {
    console.info("The run passed. Nothing to publish.")

    return
  }

  const marker = `<!-- ${FINGERPRINT_MARKER}: ${report.fingerprint} -->`
  const markdown = truncate(readFileSync(join(out, "report.md"), "utf8"), MAX_BODY)

  const issues = decodeOpenIssues(
    read("gh", [
      "issue",
      "list",
      "--repo",
      repo,
      "--label",
      "automated",
      "--state",
      "open",
      "--limit",
      "500",
      "--json",
      "number,body",
    ])
  )

  const existing = issues.find((issue) => issue.body.includes(marker))
  const bodyFile = join(out, "issue-body.md")

  if (existing === undefined) {
    const title = `${TITLES[report.outcome]} (fingerprint ${report.fingerprint})`

    const args = [
      "issue",
      "create",
      "--repo",
      repo,
      "--title",
      title,
      "--body-file",
      bodyFile,
      ...ISSUE_LABELS.flatMap((label) => ["--label", label]),
    ]

    writeFileSync(
      bodyFile,
      [
        marker,
        "",
        `The weekly run of \`.github/workflows/latest.yml\` found a failure. The workflow comments here when the same failure repeats.`,
        "",
        markdown,
      ].join("\n")
    )
    console.info(dryRun ? `Dry run: gh ${args.join(" ")}` : read("gh", args).trim())

    return
  }

  const args = [
    "issue",
    "comment",
    String(existing.number),
    "--repo",
    repo,
    "--body-file",
    bodyFile,
  ]

  writeFileSync(bodyFile, [`The same failure repeated.`, "", markdown].join("\n"))
  console.info(dryRun ? `Dry run: gh ${args.join(" ")}` : read("gh", args).trim())
}

// --- CLI ---

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "dry-run": { default: false, type: "boolean" },
    out: { type: "string" },
    override: { default: [], multiple: true, type: "string" },
    repo: { type: "string" },
  },
})

const [command] = positionals
const out = values.out

if (out === undefined) {
  throw new Error("Expected --out <folder>.")
}

if (command === "run") {
  process.exitCode = runLatest(out, values.override) === "pass" ? 0 : 1
} else if (command === "publish") {
  if (values.repo === undefined) {
    throw new Error("Expected --repo <owner/name>.")
  }

  publishLatest(out, values.repo, values["dry-run"])
} else {
  throw new Error(`Expected the command run or publish, not ${command ?? "nothing"}.`)
}
