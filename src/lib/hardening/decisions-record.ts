import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { ProjectPath, toProjectPath } from "#lib/hardening/project-files.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

/**
 * The decisions record, relative to the project root, beside the lockfile and the default rules
 * folder. In a monorepo, the root is the workspace root, so a project has one record, also when
 * `--path` selects a package.
 */
export const DECISIONS_RECORD_PATH = ".adamantite/decisions.jsonl"

/**
 * The key of a standard in the record. A decision is this key together with the scope of its line,
 * so one standard can have a decision for the project and another for a folder.
 */
const DecisionId = Schema.String.check(
  Schema.isPattern(/^[\da-z]+(?:-[\da-z]+)*$/u, {
    message: "Expected a kebab-case id, such as `tests-beside-module`",
  })
).pipe(Schema.brand("DecisionId"))

/**
 * The local date of a session, which a person reads and the agent compares with newer evidence.
 */
const SessionDate = Schema.String.check(
  Schema.isPattern(/^\d{4}-\d{2}-\d{2}$/u, { message: "Expected a date as `YYYY-MM-DD`" })
)

/**
 * Text that the prompt shows inside one list item, so it has no line break.
 */
const Sentence = Schema.String.check(
  Schema.isPattern(/^[^\n\r]+$/u, { message: "Expected text on one line" })
)

/**
 * The `--path` of the session that wrote a line: a folder from the project root, with `/` between
 * folders, as the harden context gives the scope. The scope filter compares it with the scope of
 * this session, so another spelling of the same folder, such as `./packages/web`, does not decode.
 */
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
 * A whole commit hash, of SHA-1 or SHA-256. A short hash can come to name two commits.
 */
const FullCommitHash = Schema.String.check(
  Schema.isPattern(/^(?:[\da-f]{40}|[\da-f]{64})$/u, {
    message: "Expected a full commit hash of 40 or 64 characters",
  })
)

/**
 * The keys of a decision line except `decision`. The schema grows only by optional keys, and
 * decoding leaves out a key that it does not know, so an older Adamantite reads the record of a
 * newer one.
 */
const decisionFields = {
  /**
   * The date of the decision, which the agent compares with newer evidence.
   */
  at: SessionDate,
  /**
   * How many places broke the standard when the session counted them.
   */
  break: Schema.OptionFromOptionalKey(Count),
  /**
   * The fix commits that the session saw, as short hashes.
   */
  fixes: Schema.OptionFromOptionalKey(Schema.Array(CommitHash)),
  /**
   * How many places followed the standard when the session counted them.
   */
  follow: Schema.OptionFromOptionalKey(Count),
  id: DecisionId,
  /**
   * The reason that the user gave, or the choice that the user made for a `decided` line.
   */
  reason: Schema.OptionFromOptionalKey(Sentence),
  /**
   * The rule or the step of the enforcement ladder that the session proposed.
   */
  rule: Schema.OptionFromOptionalKey(Sentence),
  /**
   * The folder that the decision applies to, absent for the whole project. A session of one folder
   * keeps the `id` of a standard and writes its own scope, so its line leaves the decision that
   * another folder has for the same standard.
   */
  scope: Schema.OptionFromOptionalKey(Scope),
  /**
   * The standard in one sentence.
   */
  standard: Sentence,
}

/**
 * A decision line of the record, as the coding agent appends it. An `approved` line only replaces
 * an earlier line of the same `id` and the same scope: the user approved what an earlier session
 * rejected or deferred there, so the rule or the instruction is the trace from then on. To end the
 * decision of a folder after an approval for the whole project, the agent appends the `approved`
 * line with the scope of that decision, which the prompt shows.
 */
const DecisionLine = Schema.Struct({
  ...decisionFields,
  decision: Schema.Literals(["approved", "decided", "deferred", "rejected"]),
})

/**
 * A decision that still applies: the last line of its `id` and scope, which is not `approved`.
 * `decided` is a resolved item of the Decisions list, with the choice in `reason`.
 */
const Decision = Schema.Struct({
  ...decisionFields,
  decision: Schema.Literals(["decided", "deferred", "rejected"]),
})

export type Decision = typeof Decision.Type

/**
 * A session line of the record: one harden session that the user answered. The coding agent copies
 * it from the prompt, also when the session wrote no decision line. `head` is the commit that
 * `HEAD` named when Adamantite rendered the prompt, so the session read the history up to it. It is
 * absent when git could not name `HEAD`, and such a line gives the fix history no start. `scope` is
 * the `--path` of the session, and is absent for the whole project.
 */
const Session = Schema.Struct({
  head: Schema.OptionFromOptionalKey(FullCommitHash),
  scope: Schema.OptionFromOptionalKey(Scope),
  session: SessionDate,
})

type Session = typeof Session.Type

/**
 * A line of the record that does not decode, with its number in the file, its text, and the reason
 * on one line.
 */
const UndecodableLine = Schema.Struct({
  issue: Schema.String,
  line: Schema.Int,
  text: Schema.String,
})

/**
 * What Adamantite knows about the decisions record, the memory of harden. The record is a JSON
 * Lines log with two kinds of lines, which their keys tell apart. A decision line has an `id`, and
 * a later line replaces an earlier line of the same `id` and the same scope. A session line has a
 * `session`. After the user answers a session, the coding agent appends the session line, and a
 * decision line for each candidate that the user did not approve and for each decision that the
 * user resolved. An approved candidate needs no line, because its rule or instruction is the
 * trace.
 *
 * Adamantite never writes the record. It decodes each line, keeps the last line of each `id` and
 * scope, and leaves out one whose last line is `approved`, and the decisions of another `--path`.
 * The harden prompt shows the kept decisions, so the agent does not read the file, and it does not
 * propose again what a decision settles. A line that does not decode is a fact for the agent to
 * repair, and it does not hide the other lines.
 *
 * The decisions and the coverage of the history are separate facts. Only a session line says what a
 * session read, so a decision line that a person edits or deletes does not move the start of the
 * fix history. `findCoveringSession` gives the session line that the fix history starts from.
 */
export const DecisionsRecord = Schema.TaggedUnion({
  /**
   * The project has no record yet. The agent creates it with the first line.
   */
  Missing: { path: ProjectPath },
  /**
   * The record exists. `decisions` has the decisions that the scope of the session keeps.
   * `sessions` has each session line in the order of the file, for each scope.
   */
  Present: {
    decisions: Schema.Array(Decision),
    path: ProjectPath,
    sessions: Schema.Array(Session),
    undecodableLines: Schema.Array(UndecodableLine),
  },
})

export type DecisionsRecord = typeof DecisionsRecord.Type

const { Missing, Present } = Data.taggedEnum<DecisionsRecord>()

/**
 * A decoded line of one of the two kinds.
 */
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

/**
 * Decodes one line of the record. The keys tell the kind of the line, so the issue of a line names
 * only what is wrong for its own kind.
 */
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

/**
 * Whether `folder` is `scope` or a folder inside it. Both are paths from the project root.
 */
function contains(scope: ProjectPath, folder: ProjectPath) {
  return folder === scope || folder.startsWith(`${scope}/`)
}

/**
 * The session line that the fix history of a session with `scope` starts from: the last line in the
 * file that covers the scope and has a `head`. A line covers a scope when it has no `scope`, or
 * when its `scope` is that folder or a parent of it, because such a session read the history of the
 * folder too. A session of a child or a sibling folder read other history, and for the whole
 * project only a line without `scope` covers. None when no such line exists.
 */
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

/**
 * Reads the decisions record of the project at `cwd`. `scope` is the folder that `--path` selects,
 * or `null` for the whole project. A scope keeps a decision without a scope, and a decision whose
 * scope contains the scope of the session or lies inside it. A blank line is not a line of the
 * record, and it keeps its place in the line numbers.
 */
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

  // A decision is its `id` together with its scope. A scope has no line break, and a line without
  // a scope has an empty second part. A map keeps the place of the first line of a key, and the
  // value of its last line.
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
