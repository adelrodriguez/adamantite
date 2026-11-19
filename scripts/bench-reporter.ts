import { Buffer } from "node:buffer"
import { spawnSync } from "node:child_process"
import { mkdirSync, writeFileSync } from "node:fs"
import { arch, cpus, release, totalmem, type } from "node:os"
import { join } from "node:path"
import process from "node:process"
import type { Reporter, TestCase, TestModule } from "vitest/node"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"

const BenchmarkCommand = Schema.Struct({
  command: Schema.String,
  firstRunMs: Schema.Finite,
  name: Schema.String,
})

const ExcludedFile = Schema.Struct({ file: Schema.String, reason: Schema.String })

export const BENCH_ANNOTATION = "adamantite:bench"

export const BenchmarkMeta = Schema.Struct({
  commands: Schema.NonEmptyArray(BenchmarkCommand),
  excluded: Schema.Array(ExcludedFile),
  mismatch: Schema.NullOr(Schema.String),
  operation: Schema.String,
  project: Schema.Struct({
    files: Schema.Int,
    programFiles: Schema.Int,
  }),
  runs: Schema.Int,
  selection: Schema.Struct({
    arguments: Schema.Array(Schema.String),
    formattedFiles: Schema.NullOr(Schema.Int),
    lintedFiles: Schema.NullOr(Schema.Int),
  }),
  stack: Schema.String,
  startedAt: Schema.String,
  versions: Schema.Record(Schema.String, Schema.String),
})

export type BenchmarkMeta = typeof BenchmarkMeta.Type

const decodeBenchmarkMeta = Schema.decodeUnknownResult(Schema.fromJsonString(BenchmarkMeta))

export interface ReportedTest {
  readonly errors: readonly string[]
  readonly id: string
  readonly meta: string | undefined
  readonly state: string
  readonly tasks: ReadonlyArray<{ readonly name: string; readonly samples: readonly number[] }>
}

interface Timing {
  readonly command: string
  readonly firstRunMs: number
  readonly maxMs: number
  readonly medianMs: number
  readonly minMs: number
  readonly name: string
  readonly runs: number
  readonly samplesMs: readonly number[]
}

export type BenchmarkResult =
  | {
      readonly id: string
      readonly kind: "invalid"
      readonly reason: string
    }
  | {
      readonly id: string
      readonly kind: "valid"
      readonly meta: BenchmarkMeta
      readonly timings: readonly Timing[]
    }

function toMedian(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1
    ? (sorted[middle] ?? Number.NaN)
    : ((sorted[middle - 1] ?? Number.NaN) + (sorted[middle] ?? Number.NaN)) / 2
}

export function toBenchmarkResult(test: ReportedTest): BenchmarkResult {
  function invalid(reason: string) {
    return { id: test.id, kind: "invalid", reason } as const
  }

  if (test.state !== "passed") {
    return invalid(
      [
        `The test ${test.state === "failed" ? "failed" : `did not run (${test.state})`}.`,
        ...test.errors,
      ]
        .join("\n\n")
        .trim()
    )
  }

  const decoded = decodeBenchmarkMeta(test.meta)

  if (Result.isFailure(decoded)) {
    return invalid(`The test recorded no valid benchmark metadata: ${decoded.failure.message}`)
  }

  const meta = decoded.success
  const timings: Timing[] = []

  for (const command of meta.commands) {
    const task = test.tasks.find((candidate) => candidate.name === command.name)

    if (task === undefined) {
      return invalid(`The test timed no runs of \`${command.command}\`.`)
    }

    if (task.samples.length !== meta.runs) {
      return invalid(
        `The test timed ${task.samples.length} runs of \`${command.command}\`, not ${meta.runs}.`
      )
    }

    const sorted = EffectArray.sort(task.samples, Order.Number)

    timings.push({
      command: command.command,
      firstRunMs: command.firstRunMs,
      maxMs: sorted.at(-1) ?? Number.NaN,
      medianMs: toMedian(sorted),
      minMs: sorted[0] ?? Number.NaN,
      name: command.name,
      runs: sorted.length,
      samplesMs: task.samples,
    })
  }

  return { id: test.id, kind: "valid", meta, timings }
}

export interface Environment {
  readonly commit: string
  readonly cpu: string
  readonly memoryGb: number
  readonly node: string
  readonly os: string
  readonly pnpm: string
}

export interface BenchmarkReport {
  readonly environment: Environment
  readonly results: readonly BenchmarkResult[]
}

function fence(text: string): string {
  const ticks = "`".repeat(Math.max(3, ...Array.from(text.matchAll(/`+/g), (m) => m[0].length + 1)))

  return `${ticks}\n${text.trimEnd()}\n${ticks}`
}

function formatMs(ms: number): string {
  return `${ms.toFixed(0)} ms`
}

function toTimingRows(meta: BenchmarkMeta, timings: readonly Timing[]): string[] {
  const files = [
    meta.selection.lintedFiles === null ? "" : `${meta.selection.lintedFiles} linted`,
    meta.selection.formattedFiles === null ? "" : `${meta.selection.formattedFiles} formatted`,
  ]
    .filter((part) => part !== "")
    .join(", ")

  return timings.map(
    (timing) =>
      `| ${meta.operation} | \`${timing.command}\` | ${files} | ${formatMs(timing.firstRunMs)} | ${formatMs(timing.medianMs)} | ${formatMs(timing.minMs)} | ${formatMs(timing.maxMs)} | ${timing.runs} |`
  )
}

function toNotes(meta: BenchmarkMeta): string[] {
  return [
    ...(meta.mismatch === null ? [] : [`- ${meta.operation}: ${meta.mismatch}`]),
    ...meta.excluded.map(
      (excluded) => `- ${meta.operation} leaves out \`${excluded.file}\`: ${excluded.reason}`
    ),
  ]
}

function toStackSection(
  stack: string,
  results: ReadonlyArray<BenchmarkResult & { kind: "valid" }>
) {
  const [first] = results

  if (first === undefined) {
    return []
  }

  const versions = Object.entries(first.meta.versions)
    .map(([name, version]) => `\`${name}\` ${version}`)
    .join(", ")

  const notes = results.flatMap((result) => toNotes(result.meta))

  return [
    `## ${stack} stack`,
    "",
    `The project holds ${first.meta.project.files} files outside \`node_modules\`, and its TypeScript program has ${first.meta.project.programFiles} files. Versions: ${versions}.`,
    "",
    "| Operation | Command | Files | First run | Median | Min | Max | Runs |",
    "| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |",
    ...results.flatMap((result) => toTimingRows(result.meta, result.timings)),
    "",
    ...(notes.length === 0 ? [] : [...notes, ""]),
  ]
}

export function toMarkdown(report: BenchmarkReport): string {
  const valid = report.results.filter((result) => result.kind === "valid")
  const invalid = report.results.filter((result) => result.kind === "invalid")
  const stacks = EffectArray.dedupe(valid.map((result) => result.meta.stack))
  const { environment } = report

  return [
    "# Benchmarks",
    "",
    `**Result:** ${valid.length} valid and ${invalid.length} invalid benchmarks.`,
    "",
    "| Commit | Node.js | pnpm | OS | CPU | Memory |",
    "| --- | --- | --- | --- | --- | --- |",
    `| ${environment.commit} | ${environment.node} | ${environment.pnpm} | ${environment.os} | ${environment.cpu} | ${environment.memoryGb} GB |`,
    "",
    "Each command ran once to validate its exit code and file selection, then the bench timed the runs. The bench keeps the operating system file cache and the caches that the tools keep themselves, and clears no cache. Compare medians only within one operation, and treat a difference smaller than the spread between the minimum and the maximum as noise.",
    "",
    ...(invalid.length === 0
      ? []
      : [
          "## Invalid benchmarks",
          "",
          ...invalid.flatMap((result) => [`### ${result.id}`, "", fence(result.reason), ""]),
        ]),
    ...stacks.flatMap((stack) =>
      toStackSection(
        stack,
        valid.filter((result) => result.meta.stack === stack)
      )
    ),
  ].join("\n")
}

interface ReportedError {
  readonly message: string
  readonly stack?: string
}

function toText(error: ReportedError): string {
  return error.stack ?? error.message
}

// A failed `beforeAll` hook reports its error on the suite, and skips the tests of the suite
// without an error of their own.
function listModuleErrors(testModule: TestModule): string[] {
  return [
    ...testModule.errors().map(toText),
    ...Array.from(testModule.children.allSuites(), (suite) =>
      suite.errors().map((error) => `In the suite "${suite.fullName}":\n\n${toText(error)}`)
    ).flat(),
  ]
}

// Vitest sends the bytes of an attachment as base64.
function findMeta(testCase: TestCase): string | undefined {
  const body = testCase.annotations().find((annotation) => annotation.type === BENCH_ANNOTATION)
    ?.attachment?.body

  if (body === undefined) {
    return undefined
  }

  return body instanceof Uint8Array
    ? new TextDecoder().decode(body)
    : Buffer.from(body, "base64").toString("utf8")
}

function toReportedTest(testCase: TestCase, moduleErrors: readonly string[]): ReportedTest {
  const result = testCase.result()
  const errors = (result.errors ?? []).map(toText)

  return {
    errors: errors.length === 0 ? moduleErrors : errors,
    id: testCase.fullName,
    meta: findMeta(testCase),
    state: result.state,
    tasks: testCase
      .benchmarks()
      .flatMap((benchmark) =>
        benchmark.tasks.map((task) => ({ name: task.name, samples: task.latency.samples ?? [] }))
      ),
  }
}

function read(command: string, args: readonly string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8" })

  return result.status === 0 ? result.stdout.trim() : "unknown"
}

function readEnvironment(): Environment {
  const commit = read("git", ["rev-parse", "HEAD"])
  const changed = read("git", ["status", "--porcelain"]) !== ""

  return {
    commit: changed ? `${commit} with uncommitted changes` : commit,
    cpu: `${cpus()[0]?.model ?? "unknown"} (${cpus().length} cores)`,
    memoryGb: Math.round(totalmem() / 1024 ** 3),
    node: process.version,
    os: `${type()} ${release()} ${arch()}`,
    pnpm: read("pnpm", ["--version"]),
  }
}

export default class BenchReporter implements Reporter {
  readonly #out = join(import.meta.dirname, "..", "bench-results")

  onTestRunEnd: Reporter["onTestRunEnd"] = (testModules, unhandledErrors) => {
    const results: BenchmarkResult[] = [
      ...testModules.flatMap((testModule): BenchmarkResult[] => {
        const moduleErrors = listModuleErrors(testModule)
        const tests = Array.from(testModule.children.allTests())

        // A module that fails to load has no test to carry its errors.
        return tests.length === 0 && moduleErrors.length > 0
          ? [
              {
                id: testModule.relativeModuleId,
                kind: "invalid",
                reason: moduleErrors.join("\n\n"),
              },
            ]
          : tests.map((testCase) => toBenchmarkResult(toReportedTest(testCase, moduleErrors)))
      }),
      ...unhandledErrors.map((error): BenchmarkResult => ({
        id: "Unhandled error",
        kind: "invalid",
        reason: toText(error),
      })),
    ]

    const report: BenchmarkReport = {
      environment: readEnvironment(),
      results:
        results.length === 0
          ? [{ id: "Run", kind: "invalid", reason: "The run found no benchmark to time." }]
          : results,
    }

    mkdirSync(this.#out, { recursive: true })
    writeFileSync(join(this.#out, "report.json"), `${JSON.stringify(report, null, 2)}\n`)
    writeFileSync(join(this.#out, "report.md"), `${toMarkdown(report)}\n`)
  }
}
