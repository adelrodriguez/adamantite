import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { ProjectPath, readLastChange, toProjectPath } from "#lib/hardening/project-files.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

/**
 * The decisions record, relative to the project root, beside the lockfile and the default rules
 * folder. In a monorepo, the root is the workspace root, so a project has one record, also when
 * `--path` selects a package.
 */
export const DECISIONS_RECORD_PATH = ".adamantite/decisions.jsonl"

/**
 * The key of a standard in the record. A later line with the same key replaces the earlier one.
 */
const DecisionId = Schema.String.check(
  Schema.isPattern(/^[\da-z]+(?:-[\da-z]+)*$/u, {
    message: "Expected a kebab-case id, such as `tests-beside-module`",
  })
).pipe(Schema.brand("DecisionId"))

const DecisionDate = Schema.String.check(
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
 * The keys of a line except `decision`. The schema grows only by optional keys, and decoding leaves
 * out a key that it does not know, so an older Adamantite reads the record of a newer one.
 */
const lineFields = {
  /**
   * The date of the decision, which the agent compares with newer evidence.
   */
  at: DecisionDate,
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
  scope: Schema.OptionFromOptionalKey(Scope),
  /**
   * The standard in one sentence.
   */
  standard: Sentence,
}

/**
 * One line of the record, as the coding agent appends it. An `approved` line only replaces an
 * earlier line of the same `id`: the user approved what an earlier session rejected or deferred, so
 * the rule or the instruction is the trace from then on.
 */
const DecisionLine = Schema.Struct({
  ...lineFields,
  decision: Schema.Literals(["approved", "decided", "deferred", "rejected"]),
})

/**
 * A decision that still applies: the last line of its `id`, which is not `approved`. `decided` is a
 * resolved item of the Decisions list, with the choice in `reason`.
 */
const Decision = Schema.Struct({
  ...lineFields,
  decision: Schema.Literals(["decided", "deferred", "rejected"]),
})

export type Decision = typeof Decision.Type

/**
 * A line of the record that does not decode, with its number in the file, its text, and the reason
 * on one line.
 */
const UndecodableLine = Schema.Struct({
  issue: Schema.String,
  line: Schema.Int,
  text: Schema.String,
})

export type UndecodableLine = typeof UndecodableLine.Type

/**
 * What Adamantite knows about the decisions record, the memory of harden. The record is a JSON
 * Lines log: one decision on each line, and a later line replaces an earlier line of the same `id`.
 * After the user answers a session, the coding agent appends a line for each candidate that the
 * user did not approve and for each decision that the user resolved. An approved candidate needs no
 * line, because its rule or instruction is the trace.
 *
 * Adamantite never writes the record. It decodes each line, keeps the last line of each `id`, and
 * leaves out an `id` whose last line is `approved`, and the decisions of another `--path`. The
 * harden prompt shows the kept decisions, so the agent does not read the file, and it does not
 * propose again what a decision settles. A line that does not decode is a fact for the agent to
 * repair, and it does not hide the other lines. The commit that last changed the file gives the fix
 * history its default start, because the session that wrote the record read the history before it.
 */
export const DecisionsRecord = Schema.TaggedUnion({
  /**
   * The project has no record yet. The agent creates it with the first line.
   */
  Missing: { path: ProjectPath },
  /**
   * The record exists. `lastChange` is the commit that last changed it, with its date as
   * `YYYY-MM-DD`, or none when git names no such commit: the record is not committed yet, or git
   * cannot read the history.
   */
  Present: {
    decisions: Schema.Array(Decision),
    lastChange: Schema.OptionFromNullOr(
      Schema.Struct({ commit: Schema.String, date: Schema.String })
    ),
    path: ProjectPath,
    undecodableLines: Schema.Array(UndecodableLine),
  },
})

export type DecisionsRecord = typeof DecisionsRecord.Type

const { Missing, Present } = Data.taggedEnum<DecisionsRecord>()

const decodeLine = Schema.decodeUnknownResult(Schema.fromJsonString(DecisionLine))

/**
 * Whether `folder` is `scope` or a folder inside it. Both are paths from the project root.
 */
function contains(scope: ProjectPath, folder: ProjectPath) {
  return folder === scope || folder.startsWith(`${scope}/`)
}

/**
 * Reads the decisions record of the project at `cwd`. `scope` is the folder that `--path` selects,
 * or `null` for the whole project. A scope keeps a decision without a scope, and a decision whose
 * scope contains the scope of the session or lies inside it. A blank line is not a decision.
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
      Result.mapError(decodeLine(text), (error): UndecodableLine => ({
        issue: error.message.replaceAll(/\s*\n\s*/gu, " "),
        line,
        text,
      }))
  )

  // A map keeps the place of the first line of an `id`, and the value of its last line.
  const decisions = [...new Map(lines.map((line) => [line.id, line])).values()]
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
    lastChange: yield* readLastChange(cwd, DECISIONS_RECORD_PATH),
    undecodableLines,
  })
})
