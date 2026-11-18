import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Path from "effect/Path"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Schema from "effect/Schema"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  DECISIONS_RECORD_PATH,
  DecisionsRecord,
  readDecisionsRecord,
} from "#lib/hardening/decisions-record.ts"
import { ProjectPath } from "#lib/hardening/project-files.ts"

const REQUIRED = {
  at: "2026-03-14",
  decision: "rejected",
  id: "tests-beside-module",
  standard: "Test files sit beside the module that they test",
}

const OPTIONAL = {
  break: 7,
  fixes: ["1a2b3c4", "9f8e7d6"],
  follow: 41,
  reason: "Integration tests stay in tests/",
  rule: "custom rule",
  scope: "packages/web",
}

const COMMIT = "4f0c1d2e3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d"

const encodeRecord = Schema.encodeSync(DecisionsRecord)

/**
 * A `git` that prints `lastChange` for `git log`, the one command that reads the record's commit.
 */
function makeGitLayer(lastChange: string) {
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
    ChildProcessSpawner.make(() =>
      Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(lastChange)),
          unref: Effect.succeed(Effect.void),
        })
      )
    )
  )
}

interface ReadOptions {
  /**
   * What `git log -1 --format="%H %cs"` prints for the record.
   */
  readonly lastChange?: string
  /**
   * The folder that `--path` selects, relative to the project root.
   */
  readonly scope?: string
}

/**
 * The text of a record that has one of `decisions` on each line.
 */
function toLines(decisions: readonly object[]) {
  return decisions.map((decision) => `${JSON.stringify(decision)}\n`).join("")
}

/**
 * Reads a record with `content`, as `harden --json` prints it.
 */
function readRecord(content: string, options: ReadOptions = {}) {
  const context = createFileSystemTestContext({ files: { [DECISIONS_RECORD_PATH]: content } })

  return readDecisionsRecord(
    context.root,
    options.scope === undefined ? null : ProjectPath.make(options.scope)
  ).pipe(
    Effect.map((record) => encodeRecord(record)),
    Effect.provide([context.layer, Path.layer, makeGitLayer(options.lastChange ?? "")])
  )
}

describe("readDecisionsRecord", () => {
  it.effect("say that a project without the file has no record", () =>
    Effect.gen(function* () {
      const context = createFileSystemTestContext()

      const record = yield* readDecisionsRecord(context.root, null).pipe(
        Effect.provide([context.layer, Path.layer, makeGitLayer("")])
      )

      expect(DecisionsRecord.guards.Missing(record)).toBe(true)
      expect(encodeRecord(record)).toHaveProperty("path", ".adamantite/decisions.jsonl")
    })
  )

  it.effect("decode a line that has only the required keys", () =>
    Effect.gen(function* () {
      const record = yield* readRecord(toLines([REQUIRED]))

      expect(record).toHaveProperty("decisions", [REQUIRED])
      expect(record).toHaveProperty("undecodableLines", [])
    })
  )

  it.effect("decode a line that has each optional key", () =>
    Effect.gen(function* () {
      const record = yield* readRecord(toLines([{ ...REQUIRED, ...OPTIONAL }]))

      expect(record).toHaveProperty("decisions", [{ ...REQUIRED, ...OPTIONAL }])
    })
  )

  it.effect("accept a line with a key that the schema does not know, and leave the key out", () =>
    Effect.gen(function* () {
      const record = yield* readRecord(toLines([{ ...REQUIRED, reviewer: "maintainer" }]))

      expect(record).toHaveProperty("decisions", [REQUIRED])
      expect(record).toHaveProperty("undecodableLines", [])
    })
  )

  it.effect("keep the last line of each id", () =>
    Effect.gen(function* () {
      const other = { ...REQUIRED, id: "default-exports", standard: "Ban default exports" }
      const later = { ...REQUIRED, at: "2026-06-01", decision: "deferred", reason: "After 2.0" }

      const record = yield* readRecord(toLines([REQUIRED, other, later]))

      expect(record).toHaveProperty("decisions", [later, other])
    })
  )

  it.effect.each([
    {
      decisions: [],
      lines: [REQUIRED, { ...REQUIRED, at: "2026-06-01", decision: "approved" }],
      name: "leave out an id whose last line is approved",
    },
    {
      decisions: [{ ...REQUIRED, at: "2026-09-01" }],
      lines: [
        REQUIRED,
        { ...REQUIRED, at: "2026-06-01", decision: "approved" },
        { ...REQUIRED, at: "2026-09-01" },
      ],
      name: "show an id that a line decides again after an approved line",
    },
  ])("$name", ({ decisions, lines }) =>
    Effect.gen(function* () {
      expect(yield* readRecord(toLines(lines))).toHaveProperty("decisions", decisions)
    })
  )

  it.effect("keep the decisions of each scope in a session of the whole project", () =>
    Effect.gen(function* () {
      const scoped = { ...REQUIRED, scope: "packages/web" }

      expect(yield* readRecord(toLines([scoped]))).toHaveProperty("decisions", [scoped])
    })
  )

  it.effect.each([
    { kept: true, name: "keep a decision without a scope", scope: undefined },
    { kept: true, name: "keep a decision of the same scope", scope: "packages/web" },
    { kept: true, name: "keep a decision of a scope that contains it", scope: "packages" },
    { kept: true, name: "keep a decision of a scope inside it", scope: "packages/web/src" },
    { kept: false, name: "leave out a decision of a sibling scope", scope: "packages/api" },
    {
      kept: false,
      name: "leave out a decision of a folder whose name starts with its name",
      scope: "packages/web-admin",
    },
  ])("$name, in a session of packages/web", ({ kept, scope }) =>
    Effect.gen(function* () {
      const line = scope === undefined ? REQUIRED : { ...REQUIRED, scope }
      const record = yield* readRecord(toLines([line]), { scope: "packages/web" })

      expect(record).toHaveProperty("decisions", kept ? [line] : [])
    })
  )

  it.effect.each([
    { name: "is not JSON", text: "rejected: tests beside module" },
    { name: "has a trailing comma", text: '{"id":"a","at":"2026-03-14","standard":"S",}' },
    { name: "is not an object", text: '["tests-beside-module"]' },
    { name: "has no `at`", text: JSON.stringify({ ...REQUIRED, at: undefined }) },
    {
      name: "has an `id` that is not kebab-case",
      text: JSON.stringify({ ...REQUIRED, id: "A b" }),
    },
    { name: "has an `at` that is not a date", text: JSON.stringify({ ...REQUIRED, at: "March" }) },
    {
      name: "has a decision that the schema does not know",
      text: JSON.stringify({ ...REQUIRED, decision: "maybe" }),
    },
    { name: "has a negative count", text: JSON.stringify({ ...REQUIRED, follow: -1 }) },
    {
      name: "has a scope that is not a path from the project root",
      text: JSON.stringify({ ...REQUIRED, scope: "./packages/web" }),
    },
    {
      name: "has a standard of two lines",
      text: JSON.stringify({ ...REQUIRED, standard: "One.\n## Two" }),
    },
  ])("list a line that $name with its line number, and keep the valid lines", ({ text }) =>
    Effect.gen(function* () {
      const other = { ...REQUIRED, id: "default-exports" }

      // The blank line is not a decision, and it keeps its place in the line numbers.
      const record = yield* readRecord(`${toLines([REQUIRED])}\n${text}\n${toLines([other])}`)

      expect(record).toHaveProperty("decisions", [REQUIRED, other])
      expect(record).toHaveProperty("undecodableLines", [
        { issue: expect.stringMatching(/^[^\n]+$/u), line: 3, text },
      ])
    })
  )

  it.effect.each([
    { lastChange: { commit: COMMIT, date: "2026-11-02" }, output: `${COMMIT} 2026-11-02\n` },
    { lastChange: { commit: COMMIT, date: "2026-11-02" }, output: `${COMMIT} 2026-11-02\r\n` },
    { lastChange: null, output: "" },
  ])(
    "give the commit that last changed the record, or none: $lastChange",
    ({ lastChange, output }) =>
      Effect.gen(function* () {
        const record = yield* readRecord(toLines([REQUIRED]), { lastChange: output })

        expect(record).toHaveProperty("lastChange", lastChange)
      })
  )

  it("give only a record that exists its decisions, its lines, and its commit", () => {
    type Missing = Extract<DecisionsRecord, { _tag: "Missing" }>

    type Present = Extract<DecisionsRecord, { _tag: "Present" }>

    expectTypeOf<Missing>().not.toHaveProperty("decisions")
    expectTypeOf<Missing>().not.toHaveProperty("undecodableLines")
    expectTypeOf<Missing>().not.toHaveProperty("lastChange")
    expectTypeOf<Present["decisions"][number]["decision"]>().toEqualTypeOf<
      "decided" | "deferred" | "rejected"
    >()
  })
})
