import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { ProjectPath, toProjectPath } from "#lib/hardening/project-files.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

export const DECISIONS_RECORD_PATH = ".adamantite/decisions.jsonl"

const DecisionId = Schema.String.check(
  Schema.isPattern(/^[\da-z]+(?:-[\da-z]+)*$/u, {
    message: "Expected a kebab-case id, such as `tests-beside-module`",
  })
).pipe(Schema.brand("DecisionId"))

const SessionDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u, { message: "Expected a date as `YYYY-MM-DD`" })
)

const Sentence = Schema.String.check(
  Schema.isPattern(/^[^\n\r]+$/u, { message: "Expected text on one line" })
)

const Scope = Schema.String.check(
  Schema.isPattern(/^(?!\.{1,2}(?:\/|$))[^\n\r/\\]+(?:\/(?!\.{1,2}(?:\/|$))[^\n\r/\\]+)*$/u, {
    message: "Expected a folder path from the project root, such as `packages/web`",
  })
).pipe(Schema.brand("ProjectPath"))

const Count = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))

const CommitHash = Schema.String.check(
  Schema.isPattern(/^[\da-f]{4,64}$/u, { message: "Expected a commit hash, such as `1a2b3c4`" })
)

/**
 * A short hash can come to name two commits.
 */
const FullCommitHash = Schema.String.check(
  Schema.isPattern(/^(?:[\da-f]{40}|[\da-f]{64})$/u, {
    message: "Expected a full commit hash of 40 or 64 characters",
  })
)

const decisionFields = {
  at: SessionDate,
  break: Schema.OptionFromOptionalKey(Count),
  fixes: Schema.OptionFromOptionalKey(Schema.Array(CommitHash)),
  follow: Schema.OptionFromOptionalKey(Count),
  id: DecisionId,
  reason: Schema.OptionFromOptionalKey(Sentence),
  rule: Schema.OptionFromOptionalKey(Sentence),
  scope: Schema.OptionFromOptionalKey(Scope),
  standard: Sentence,
}

const DecisionLine = Schema.Struct({
  ...decisionFields,
  decision: Schema.Literals(["approved", "decided", "deferred", "rejected"]),
})

const Decision = Schema.Struct({
  ...decisionFields,
  decision: Schema.Literals(["decided", "deferred", "rejected"]),
})

export type Decision = typeof Decision.Type

const Session = Schema.Struct({
  head: Schema.OptionFromOptionalKey(FullCommitHash),
  scope: Schema.OptionFromOptionalKey(Scope),
  session: SessionDate,
})

type Session = typeof Session.Type

const UndecodableLine = Schema.Struct({
  issue: Schema.String,
  line: Schema.Int,
  text: Schema.String,
})

export const DecisionsRecord = Schema.TaggedUnion({
  Missing: { path: ProjectPath },
  Present: {
    decisions: Schema.Array(Decision),
    path: ProjectPath,
    sessions: Schema.Array(Session),
    undecodableLines: Schema.Array(UndecodableLine),
  },
})

export type DecisionsRecord = typeof DecisionsRecord.Type

const { Missing, Present } = Data.taggedEnum<DecisionsRecord>()

type Line = Data.TaggedEnum<{
  DecisionLine: { readonly value: typeof DecisionLine.Type }
  SessionLine: { readonly value: Session }
}>

const Lines = Data.taggedEnum<Line>()

const decodeObject = Schema.decodeUnknownResult(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown))
)

const decodeDecisionLine = Schema.decodeUnknownResult(DecisionLine)
const decodeSession = Schema.decodeUnknownResult(Session)

function decodeLine(text: string): Result.Result<Line, string> {
  const object = decodeObject(text)

  if (Result.isFailure(object)) {
    return Result.fail(object.failure.message)
  }

  if (Object.hasOwn(object.success, "id")) {
    return Result.mapBoth(decodeDecisionLine(object.success), {
      onFailure: (error) => error.message,
      onSuccess: (value): Line => Lines.DecisionLine({ value }),
    })
  }

  if (Object.hasOwn(object.success, "session")) {
    return Result.mapBoth(decodeSession(object.success), {
      onFailure: (error) => error.message,
      onSuccess: (value): Line => Lines.SessionLine({ value }),
    })
  }

  return Result.fail("Expected a decision line with `id`, or a session line with `session`")
}

function contains(scope: ProjectPath, folder: ProjectPath) {
  return folder === scope || folder.startsWith(`${scope}/`)
}

export function findCoveringSession(record: DecisionsRecord, scope: ProjectPath | null) {
  return DecisionsRecord.match(record, {
    Missing: () => Option.none(),
    Present: ({ sessions }) =>
      Array.last(
        sessions
          .filter((line) =>
            Option.match(line.scope, {
              onNone: () => true,
              onSome: (folder) => scope !== null && contains(folder, scope),
            })
          )
          .flatMap((line) =>
            Option.match(line.head, {
              onNone: () => [],
              onSome: (head) => [{ head, session: line.session }],
            })
          )
      ),
  })
}

export const readDecisionsRecord = Effect.fn("readDecisionsRecord")(function* (
  cwd: string,
  scope: ProjectPath | null
) {
  const path = yield* Path.Path
  const file = path.join(cwd, DECISIONS_RECORD_PATH)
  const record = { path: toProjectPath(path, cwd, file) }
  const content = yield* readFileIfExists(file)

  if (Option.isNone(content)) {
    return Missing(record)
  }

  const [lines, undecodableLines] = Array.partition(
    content.value
      .split(/\r?\n/u)
      .map((text, index) => ({ line: index + 1, text }))
      .filter(({ text }) => text.trim() !== ""),
    ({ line, text }) =>
      Result.mapError(decodeLine(text), (issue) => ({
        issue: issue.replaceAll(/\s*\n\s*/gu, " "),
        line,
        text,
      }))
  )

  const decisionLines = lines.filter(Lines.$is("DecisionLine")).map(({ value }) => value)

  // A map keeps the place of the first line of a key, and the value of its last line.
  const decisions = [
    ...new Map(
      decisionLines.map((line) => [`${line.id}\n${Option.getOrElse(line.scope, () => "")}`, line])
    ).values(),
  ]
    .flatMap((line): Decision[] =>
      line.decision === "approved" ? [] : [{ ...line, decision: line.decision }]
    )
    .filter(
      (decision) =>
        scope === null
        || Option.match(decision.scope, {
          onNone: () => true,
          onSome: (folder) => contains(folder, scope) || contains(scope, folder),
        })
    )

  return Present({
    ...record,
    decisions,
    sessions: lines.filter(Lines.$is("SessionLine")).map(({ value }) => value),
    undecodableLines,
  })
})
