import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import {
  DECISIONS_RECORD_PATH,
  DecisionsRecord,
  findCoveringSession,
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
const LATER_COMMIT = "9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b"

const encodeRecord = Schema.encodeSync(DecisionsRecord)

/**
 * The text of a record that has one of `decisions` on each line.
 */
function toLines(decisions: readonly object[]) {
  return decisions.map((decision) => `${JSON.stringify(decision)}\n`).join("")
}

/**
 * Reads a record with `content`. `scope` is the folder that `--path` selects, relative to the
 * project root.
 */
function readRecord(content: string, scope?: string) {
  const context = createFileSystemTestContext({ files: { [DECISIONS_RECORD_PATH]: content } })

  return readDecisionsRecord(
    context.root,
    scope === undefined ? null : ProjectPath.make(scope)
  ).pipe(Effect.provide([context.layer, Path.layer]))
}

/**
 * Reads a record with `content`, as `harden --json` prints it.
 */
function readEncodedRecord(content: string, scope?: string) {
  return readRecord(content, scope).pipe(Effect.map((record) => encodeRecord(record)))
}

describe("readDecisionsRecord", () => {
  it.effect("say that a project without the file has no record", () =>
    Effect.gen(function* () {
      const context = createFileSystemTestContext()

      const record = yield* readDecisionsRecord(context.root, null).pipe(
        Effect.provide([context.layer, Path.layer])
      )

      expect(DecisionsRecord.guards.Missing(record)).toBe(true)
      expect(encodeRecord(record)).toHaveProperty("path", ".adamantite/decisions.jsonl")
    })
  )

  it.effect("decode a line that has only the required keys", () =>
    Effect.gen(function* () {
      const record = yield* readEncodedRecord(toLines([REQUIRED]))

      expect(record).toHaveProperty("decisions", [REQUIRED])
      expect(record).toHaveProperty("undecodableLines", [])
    })
  )

  it.effect("decode a line that has each optional key", () =>
    Effect.gen(function* () {
      const record = yield* readEncodedRecord(toLines([{ ...REQUIRED, ...OPTIONAL }]))

      expect(record).toHaveProperty("decisions", [{ ...REQUIRED, ...OPTIONAL }])
    })
  )

  it.effect("accept a line with a key that the schema does not know, and leave the key out", () =>
    Effect.gen(function* () {
      const record = yield* readEncodedRecord(toLines([{ ...REQUIRED, reviewer: "maintainer" }]))

      expect(record).toHaveProperty("decisions", [REQUIRED])
      expect(record).toHaveProperty("undecodableLines", [])
    })
  )

  it.effect("keep the last line of each id", () =>
    Effect.gen(function* () {
      const other = { ...REQUIRED, id: "default-exports", standard: "Ban default exports" }
      const later = { ...REQUIRED, at: "2026-06-01", decision: "deferred", reason: "After 2.0" }

      const record = yield* readEncodedRecord(toLines([REQUIRED, other, later]))

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
      expect(yield* readEncodedRecord(toLines(lines))).toHaveProperty("decisions", decisions)
    })
  )

  it.effect("keep the decisions of each scope in a session of the whole project", () =>
    Effect.gen(function* () {
      const scoped = { ...REQUIRED, scope: "packages/web" }

      expect(yield* readEncodedRecord(toLines([scoped]))).toHaveProperty("decisions", [scoped])
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
      const record = yield* readEncodedRecord(toLines([line]), "packages/web")

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
    { name: "has neither `id` nor `session`", text: '{"note":"Ask the maintainer"}' },
    { name: "has a `session` that is not a date", text: '{"session":"March"}' },
    {
      name: "has a `head` that is not a full commit hash",
      text: JSON.stringify({ head: "1a2b3c4", session: "2026-03-14" }),
    },
    {
      name: "has a session scope that is not a path from the project root",
      text: JSON.stringify({ scope: "/packages/web", session: "2026-03-14" }),
    },
    {
      name: "has a standard of two lines",
      text: JSON.stringify({ ...REQUIRED, standard: "One.\n## Two" }),
    },
  ])("list a line that $name with its line number, and keep the valid lines", ({ text }) =>
    Effect.gen(function* () {
      const other = { ...REQUIRED, id: "default-exports" }

      // The blank line is not a decision, and it keeps its place in the line numbers.
      const record = yield* readEncodedRecord(
        `${toLines([REQUIRED])}\n${text}\n${toLines([other])}`
      )

      expect(record).toHaveProperty("decisions", [REQUIRED, other])
      expect(record).toHaveProperty("undecodableLines", [
        { issue: expect.stringMatching(/^[^\n]+$/u), line: 3, text },
      ])
    })
  )

  it.effect(
    "decode a session line with and without its optional keys, in the order of the file",
    () =>
      Effect.gen(function* () {
        const sessions = [
          { session: "2026-03-14" },
          { head: COMMIT, scope: "packages/web", session: "2026-03-20" },
          { head: LATER_COMMIT, session: "2026-04-01", tool: "a later key" },
        ]

        // A session line is not a decision, and a scope does not leave one out.
        const record = yield* readEncodedRecord(toLines([REQUIRED, ...sessions]), "packages/api")

        expect(record).toHaveProperty("decisions", [REQUIRED])
        expect(record).toHaveProperty("sessions", [
          { session: "2026-03-14" },
          { head: COMMIT, scope: "packages/web", session: "2026-03-20" },
          { head: LATER_COMMIT, session: "2026-04-01" },
        ])
        expect(record).toHaveProperty("undecodableLines", [])
      })
  )

  it("give only a record that exists its decisions, its sessions, and its lines", () => {
    type Missing = Extract<DecisionsRecord, { _tag: "Missing" }>

    type Present = Extract<DecisionsRecord, { _tag: "Present" }>

    expectTypeOf<Missing>().not.toHaveProperty("decisions")
    expectTypeOf<Missing>().not.toHaveProperty("undecodableLines")
    expectTypeOf<Missing>().not.toHaveProperty("sessions")
    expectTypeOf<Present["decisions"][number]["decision"]>().toEqualTypeOf<
      "decided" | "deferred" | "rejected"
    >()
  })
})

// A session line of the whole project that recorded a commit.
const SESSION = { head: COMMIT, session: "2026-03-14" }

/**
 * The session line that covers `scope` in a record with `lines`.
 */
function findSession(lines: readonly object[], scope?: string) {
  return readRecord(toLines(lines), scope).pipe(
    Effect.map((record) =>
      findCoveringSession(record, scope === undefined ? null : ProjectPath.make(scope))
    )
  )
}

describe("findCoveringSession", () => {
  it.effect.each([
    {
      covers: true,
      line: undefined,
      name: "a session of the whole project",
      scope: "packages/web",
    },
    {
      covers: true,
      line: "packages/web",
      name: "a session of the same folder",
      scope: "packages/web",
    },
    { covers: true, line: "packages", name: "a session of a parent folder", scope: "packages/web" },
    {
      covers: false,
      line: "packages/web/src",
      name: "a session of a child folder",
      scope: "packages/web",
    },
    { covers: false, line: "packages/api", name: "a session of a sibling", scope: "packages/web" },
    {
      covers: false,
      line: "packages/web",
      name: "a session of a folder whose name starts its name",
      scope: "packages/web-admin",
    },
    { covers: true, line: undefined, name: "a session of the whole project", scope: undefined },
    { covers: false, line: "packages/web", name: "a session of a folder", scope: undefined },
  ])("say whether $name covers a session of $scope: $covers", ({ covers, line, scope }) =>
    Effect.gen(function* () {
      const found = yield* findSession(
        [line === undefined ? SESSION : { ...SESSION, scope: line }],
        scope
      )

      expect(found).toStrictEqual(covers ? Option.some(SESSION) : Option.none())
    })
  )

  it.effect("give the last covering line that has a head", () =>
    Effect.gen(function* () {
      const found = yield* findSession(
        [
          SESSION,
          { head: LATER_COMMIT, scope: "packages", session: "2026-04-01" },
          { head: COMMIT, scope: "packages/api", session: "2026-05-01" },
          { scope: "packages/web", session: "2026-06-01" },
        ],
        "packages/web"
      )

      expect(found).toStrictEqual(Option.some({ head: LATER_COMMIT, session: "2026-04-01" }))
    })
  )

  it.effect.each([
    { lines: [REQUIRED], name: "the record has no session line" },
    { lines: [{ session: "2026-03-14" }], name: "the covering line has no head" },
  ])("give none when $name", ({ lines }) =>
    Effect.gen(function* () {
      expect(yield* findSession(lines)).toStrictEqual(Option.none())
    })
  )

  it("give none for a project without a record", () => {
    const record = DecisionsRecord.cases.Missing.make({ path: ProjectPath.make("decisions.jsonl") })

    expect(findCoveringSession(record, null)).toStrictEqual(Option.none())
  })
})
