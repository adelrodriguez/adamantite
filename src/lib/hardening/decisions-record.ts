import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { ProjectPath, readLastChange, toProjectPath } from "#lib/hardening/project-files.ts"
import { checkExists } from "#lib/shared/filesystem.ts"

/**
 * The decisions record, relative to the project root, beside the lockfile and the default rules
 * folder. In a monorepo, the root is the workspace root, so a project has one record, also when
 * `--path` selects a package.
 */
export const DECISIONS_RECORD_PATH = ".adamantite/decisions.md"

/**
 * What Adamantite knows about the decisions record, the memory of harden. After the user answers a
 * session, the coding agent writes to the record each candidate that the user did not approve and
 * each decision that the user resolved. An approved candidate needs no entry, because its rule or
 * instruction is the trace. The next session reads the record, and does not propose again what an
 * entry settles.
 *
 * Adamantite never writes the record and never parses its entries. It reads two facts: whether the
 * file exists, and which commit last changed it. The harden prompt names the path and the commit,
 * and the agent reads the file. The commit also gives the fix history its default start, because
 * the session that wrote the record read the history before it. The record holds decisions, not
 * standards, so it stays out of the documentation list and of agent reach.
 */
export const DecisionsRecord = Schema.TaggedUnion({
  /**
   * The record exists, and `commit` last changed it, on `date` as `YYYY-MM-DD`.
   */
  Committed: { commit: Schema.String, date: Schema.String, path: ProjectPath },
  /**
   * The project has no record yet. The agent creates it with the first entry.
   */
  Missing: { path: ProjectPath },
  /**
   * The record exists, and git names no commit that changed it: the record is not committed yet, or
   * git cannot read the history.
   */
  Uncommitted: { path: ProjectPath },
})

export type DecisionsRecord = typeof DecisionsRecord.Type

const { Committed, Missing, Uncommitted } = Data.taggedEnum<DecisionsRecord>()

/**
 * Reads the facts about the decisions record of the project at `cwd`. It asks git only for a record
 * that exists, so a record that a commit deleted is missing.
 */
export const readDecisionsRecord = Effect.fn("readDecisionsRecord")(function* (cwd: string) {
  const path = yield* Path.Path
  const file = path.join(cwd, DECISIONS_RECORD_PATH)
  const record = { path: toProjectPath(path, cwd, file) }

  if (!(yield* checkExists(file))) {
    return Missing(record)
  }

  return Option.match(yield* readLastChange(cwd, DECISIONS_RECORD_PATH), {
    onNone: () => Uncommitted(record),
    onSome: (change) => Committed({ ...change, ...record }),
  })
})
