import { spawnSync } from "node:child_process"
import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { arch, release, tmpdir, type } from "node:os"
import { basename, join, resolve } from "node:path"
import process from "node:process"
import { parseArgs } from "node:util"
import type { TestModuleState, TestState } from "vitest/node"
import * as EffectArray from "effect/Array"
import * as Data from "effect/Data"
import * as Order from "effect/Order"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

const repoRoot = join(import.meta.dirname, "..")
const FIXTURE_PACKAGES = "presets/__tests__/fixture-packages"

const CHECKOUT_REPORTER = join(import.meta.dirname, "latest-reporter.ts")
const LOCKFILES = ["pnpm-lock.yaml", `${FIXTURE_PACKAGES}/pnpm-lock.yaml`]

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
  "@effect/vitest",
  "vitest",
  "@vitest/coverage-v8",
  "@vitest/ui",
]

const FINGERPRINT_MARKER = "adamantite-latest-fingerprint"

const ISSUE_LABELS = ["automated", "dependencies", "needs-triage"]

const RUN_BUDGET = 45 * 60 * 1000

type StepName =
  | "baseline-install"
  | "baseline-install-fixtures"
  | TestRunName
  | "update-root"
  | "update-fixtures"
  | `override-${number}`

const STEP_NAMES = [
  "baseline-install",
  "baseline-install-fixtures",
  "baseline",
  "update-root",
  "update-fixtures",
  "candidate",
] as const satisfies readonly StepName[]

type TestRunName = "baseline" | "candidate"

const RUN_FILES = new Set([
  "report.json",
  "report.md",
  "issue-body.md",
  "lockfiles.diff",
  "baseline.results.json",
  "candidate.results.json",
  ...STEP_NAMES.map((name) => `${name}.log`),
])

const OVERRIDE_LOG = /^override-\d+\.log$/

// GitHub rejects an issue body or a comment longer than 65,536 characters.
const MAX_BODY = 60_000
const MAX_DIAGNOSTIC = 6000

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

const REPORTED_STATES = {
  failed: "failed",
  passed: "passed",
  pending: "pending",
  queued: "queued",
  skipped: "skipped",
} as const satisfies { readonly [State in TestModuleState | TestState]: State }

const ReportedState = Schema.Literals(Object.values(REPORTED_STATES))

const Failure = Schema.Struct({
  diagnostic: Schema.String,
  fixtures: Schema.Array(Schema.String),
  id: Schema.String,
  rules: Schema.Array(Schema.String),
  status: Schema.Union([ReportedState, Schema.Literals(["missing", "unreadable"])]),
})

type Failure = typeof Failure.Type

const Report = Schema.Struct({
  baselineVersions: Schema.Record(Schema.String, Schema.String),
  candidateVersions: Schema.Record(Schema.String, Schema.String),
  commit: Schema.String,
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

const ReportedResult = Schema.Struct({
  errors: Schema.Array(Schema.String),
  id: Schema.String,
  state: ReportedState,
})

const LatestResults = Schema.Struct({
  modules: Schema.Array(ReportedResult),
  tests: Schema.Array(Schema.Struct({ ...ReportedResult.fields, module: Schema.String })),
})

const decodeLatestResults = Schema.decodeResult(Schema.fromJsonString(LatestResults))

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

function runStep(
  name: StepName,
  command: string,
  args: string[],
  options: {
    readonly cwd: string
    readonly env: Record<string, string>
    readonly out: string
    readonly timeout: number
  }
): Step {
  const start = performance.now()
  // Vitest prints color whenever FORCE_COLOR is set, which would fill the logs and the issue.
  const { FORCE_COLOR: _forceColor, ...env } = process.env

  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...env, NO_COLOR: "1", ...options.env },
    maxBuffer: 64 * 1024 * 1024,
    timeout: options.timeout,
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

function readVersions(worktree: string): Record<string, string> {
  const fixtures = readPackageJson(join(worktree, FIXTURE_PACKAGES, "package.json"))

  function installed(folder: string, name: string) {
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

type ReportedTest = (typeof LatestResults.Type)["tests"][number]

interface TestRun {
  readonly failedModules: ReadonlyMap<string, readonly string[]>
  readonly tests: ReadonlyMap<string, ReportedTest>
}

type TestRunRead = Data.TaggedEnum<{
  Missing: { readonly path: string }
  Read: { readonly run: TestRun }
  Unreadable: { readonly failure: Failure }
}>

const TestRunRead = Data.taggedEnum<TestRunRead>()

const isRead = TestRunRead.$is("Read")

function readTestRun(path: string): TestRunRead {
  return existsSync(path)
    ? parseTestRun(basename(path), readFileSync(path, "utf8"))
    : TestRunRead.Missing({ path })
}

export function parseTestRun(file: string, text: string): TestRunRead {
  return Result.match(decodeLatestResults(text), {
    onFailure: (error) =>
      TestRunRead.Unreadable({ failure: toFailure(file, "unreadable", [error.message]) }),
    onSuccess: (results) =>
      TestRunRead.Read({
        run: {
          failedModules: new Map(
            results.modules.flatMap((module) =>
              module.errors.length > 0 ? [[module.id, module.errors] as const] : []
            )
          ),
          tests: new Map(results.tests.map((test) => [test.id, test])),
        },
      }),
  })
}

function listUnreadable(reads: readonly TestRunRead[]): Failure[] {
  return reads.flatMap(
    TestRunRead.$match({
      Missing: () => [],
      Read: () => [],
      Unreadable: ({ failure }) => [failure],
    })
  )
}

const ANSI = new RegExp(`${String.fromCodePoint(27)}\\[[0-9;]*m`, "g")

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

function toFailure(id: string, status: Failure["status"], messages: readonly string[]): Failure {
  const diagnostic = messages.join("\n\n").replaceAll(ANSI, "")

  return {
    diagnostic,
    fixtures: matchAll(diagnostic, "fixture", [FIXTURE_STRING, REPORT_STRING]),
    id,
    rules: matchAll(diagnostic, "rule", [RULE_FIELD, REPORT_STRING]),
    status,
  }
}

// Vitest finishes the test modules in a different order in each run, so the failures sort by ID.
const byId = Order.mapInput(Order.String, (failure: Failure) => failure.id)

function listFailures(run: TestRun): Failure[] {
  return EffectArray.sort(
    [
      ...Array.from(run.failedModules, ([id, errors]) => toFailure(id, "failed", errors)),
      ...[...run.tests.values()].flatMap((test) =>
        test.state === "failed" ? [toFailure(test.id, test.state, test.errors)] : []
      ),
    ],
    byId
  )
}

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

  return EffectArray.sort([...listFailures(candidate), ...lost], byId)
}

function isSkipped(test: ReportedTest | undefined): boolean {
  return test?.state === "skipped" || test?.state === "pending"
}

export function listSkipped(baseline: TestRunRead, candidate: TestRunRead): string[] {
  if (!isRead(baseline) || !isRead(candidate)) {
    return []
  }

  const skipped = [...baseline.run.tests.values()].flatMap((test) =>
    isSkipped(test) && isSkipped(candidate.run.tests.get(test.id)) ? [test.id] : []
  )

  return EffectArray.sort(skipped, Order.String)
}

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
          EffectArray.sort(
            failures.map((failure) => failure.id),
            Order.String
          ),
          EffectArray.sort(new Set(failures.flatMap((failure) => failure.rules)), Order.String),
        ]

  return createHash("sha256").update(JSON.stringify(identity)).digest("hex").slice(0, 16)
}

interface Classification {
  readonly failures: Failure[]
  readonly outcome: Outcome
}

interface RunResults {
  readonly baseline: TestRunRead
  readonly baselinePassed: boolean
  readonly candidate: TestRunRead
  readonly candidatePassed: boolean
  readonly updated: boolean
}

export function classify(results: RunResults): Classification {
  const { baseline, candidate } = results

  if (!results.baselinePassed) {
    return {
      failures: isRead(baseline) ? listFailures(baseline.run) : listUnreadable([baseline]),
      outcome: "baseline-failure",
    }
  }

  if (!results.updated) {
    return { failures: [], outcome: "install-failure" }
  }

  if (!isRead(baseline) || !isRead(candidate)) {
    return { failures: listUnreadable([baseline, candidate]), outcome: "process-failure" }
  }

  const failures = listRegressions(baseline.run, candidate.run)

  if (![...candidate.run.tests.values()].some((test) => test.state === "passed")) {
    return { failures, outcome: "process-failure" }
  }

  if (failures.length > 0) {
    return { failures, outcome: "regression" }
  }

  return { failures, outcome: results.candidatePassed ? "pass" : "process-failure" }
}

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

function runLatest(out: string, overrides: readonly string[]): Outcome {
  mkdirSync(out, { recursive: true })

  for (const file of readdirSync(out)) {
    if (RUN_FILES.has(file) || OVERRIDE_LOG.test(file)) {
      rmSync(join(out, file))
    }
  }

  const deadline = performance.now() + RUN_BUDGET

  const commit = read("git", ["rev-parse", "HEAD"]).trim()
  // On macOS, the temporary folder is a symbolic link, and the paths that a test prints start with
  // the real path.
  const worktree = realpathSync(mkdtempSync(join(tmpdir(), "adamantite-latest-")))
  const steps: Step[] = []

  function step(name: StepName, command: string, args: string[], env: Record<string, string> = {}) {
    const result = runStep(name, command, args, {
      cwd: worktree,
      env,
      out,
      // A timeout of 0 means no limit, so the last step gets at least one second.
      timeout: Math.max(1000, Math.round(deadline - performance.now())),
    })

    steps.push(result)

    return result.exitCode === 0
  }

  function testPresets(name: TestRunName) {
    return step(
      name,
      "pnpm",
      ["run", "test:presets", "--reporter=default", `--reporter=${CHECKOUT_REPORTER}`],
      { ADAMANTITE_LATEST_RESULTS: join(out, `${name}.results.json`) }
    )
  }

  read("git", ["worktree", "add", "--detach", worktree, commit])

  try {
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

    const candidate: TestRunRead = updated
      ? readTestRun(join(out, "candidate.results.json"))
      : TestRunRead.Missing({ path: join(out, "candidate.results.json") })

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
        failedLogs.length > 0 && failures.every((failure) => failure.diagnostic === "")
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
      skipped: listSkipped(baseline, candidate),
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
        `The weekly run of \`.github/workflows/weekly.yml\` found a failure. The workflow comments here when the same failure repeats.`,
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

if (import.meta.main) {
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

  if (values.out === undefined) {
    throw new Error("Expected --out <folder>.")
  }

  // Absolute, because Vitest writes the results from the temporary worktree.
  const out = resolve(values.out)

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
}
