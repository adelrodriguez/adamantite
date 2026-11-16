import { describe, expect, it } from "@effect/vitest"
import {
  type BenchmarkMeta,
  type ReportedTest,
  toBenchmarkResult,
  toMarkdown,
} from "../bench-reporter.ts"

const META = {
  commands: [
    {
      command: "node node_modules/adamantite/bin/adamantite check",
      firstRunMs: 520,
      name: "adamantite",
    },
    { command: "node_modules/.bin/oxfmt --check", firstRunMs: 80, name: "direct" },
  ],
  excluded: [],
  mismatch: null,
  operation: "check",
  project: { files: 22, programFiles: 434 },
  runs: 4,
  selection: { arguments: [], formattedFiles: 22, lintedFiles: 20 },
  stack: "jest",
  startedAt: "2026-11-16T00:00:00.000Z",
  versions: { oxlint: "1.93.0" },
} satisfies BenchmarkMeta

const ADAMANTITE_RUNS = { name: "adamantite", samples: [500, 490, 530, 510] }

const PASSED: ReportedTest = {
  errors: [],
  id: "jest stack > operations > check",
  meta: JSON.stringify(META),
  state: "passed",
  tasks: [ADAMANTITE_RUNS, { name: "direct", samples: [79, 81, 77, 80] }],
}

const ENVIRONMENT = {
  commit: "abc",
  cpu: "CPU (8 cores)",
  memoryGb: 16,
  node: "v26.13.0",
  os: "Linux 6.8.0 x64",
  pnpm: "12.14.0",
}

describe("toBenchmarkResult", () => {
  it("times each command of a passed test by its median, minimum, and maximum", () => {
    expect(toBenchmarkResult(PASSED)).toMatchObject({
      kind: "valid",
      timings: [
        { maxMs: 530, medianMs: 505, minMs: 490, name: "adamantite", runs: 4 },
        { maxMs: 81, medianMs: 79.5, minMs: 77, name: "direct", runs: 4 },
      ],
    })
  })

  it.each([
    {
      name: "a failed test",
      reason: "The test failed.\n\nError: `oxlint` exited with 1.",
      test: { ...PASSED, errors: ["Error: `oxlint` exited with 1."], state: "failed" },
    },
    {
      name: "a skipped test",
      reason: "The test did not run (skipped).\n\nIn the suite: beforeAll failed",
      test: { ...PASSED, errors: ["In the suite: beforeAll failed"], state: "skipped" },
    },
    {
      name: "a test without metadata",
      reason: "The test recorded no valid benchmark metadata",
      test: { ...PASSED, meta: undefined },
    },
    {
      name: "a test that timed fewer runs than planned",
      reason: "The test timed 2 runs of `node_modules/.bin/oxfmt --check`, not 4.",
      test: {
        ...PASSED,
        tasks: [ADAMANTITE_RUNS, { name: "direct", samples: [79, 81] }],
      },
    },
    {
      name: "a test that did not time a command",
      reason: "The test timed no runs of `node_modules/.bin/oxfmt --check`.",
      test: { ...PASSED, tasks: [ADAMANTITE_RUNS] },
    },
  ])("reports $name as invalid, without a timing", ({ reason, test }) => {
    const result = toBenchmarkResult(test)

    expect(result).toStrictEqual({
      id: PASSED.id,
      kind: "invalid",
      reason: expect.stringContaining(reason),
    })
  })
})

describe("toMarkdown", () => {
  it("lists an invalid benchmark with its reason, and times only the valid ones", () => {
    const markdown = toMarkdown({
      environment: ENVIRONMENT,
      results: [
        toBenchmarkResult(PASSED),
        toBenchmarkResult({
          ...PASSED,
          errors: ["Error: `oxlint` exited with 1."],
          id: "jest stack > operations > lint",
          state: "failed",
        }),
      ],
    })

    expect(markdown).toContain("**Result:** 1 valid and 1 invalid benchmarks.")
    expect(markdown).toContain("### jest stack > operations > lint")
    expect(markdown).toContain(
      "| check | `node node_modules/adamantite/bin/adamantite check` | 20 linted, 22 formatted | 520 ms | 505 ms | 490 ms | 530 ms | 4 |"
    )
    expect(markdown).not.toMatch(/^\| lint \|/m)
  })
})
