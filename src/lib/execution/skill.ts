import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Jsonc from "effect/encoding/Jsonc"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { codingAgents } from "#lib/execution/coding-agents.ts"
import { FailedToParseFile, FailedToReadFile, FailedToWriteFile } from "#lib/shared/errors.ts"
import { readFileIfExists, writeJsonFile } from "#lib/shared/filesystem.ts"
import { checkIsJsonObject } from "#lib/shared/json.ts"

const SKILL_NAME = "adamantite"

/**
 * A project folder that coding agents load skills from, such as `.agents/skills`.
 */
export type SkillFolder = (typeof codingAgents)[number]["skillsFolder"]

/**
 * Each skill folder once, in alphabetical order, which puts the shared `.agents/skills` first.
 */
const skillFolders: readonly SkillFolder[] = Array.sort(
  Array.dedupe(codingAgents.map((agent) => agent.skillsFolder)),
  Order.String
)

/**
 * The folder that most agents read: Codex, Cursor, Gemini CLI, and OpenCode.
 */
const SHARED_SKILL_FOLDER: SkillFolder = ".agents/skills"

/**
 * The skill folders of the agents that a project uses: the shared `.agents/skills`, and each other
 * skill folder whose agent folder exists, such as `.claude` for `.claude/skills`.
 */
export const detectSkillFolders = Effect.fn("detectSkillFolders")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  return yield* Effect.filter(
    skillFolders,
    (folder) => {
      const agentFolder = path.join(cwd, path.dirname(folder))

      return folder === SHARED_SKILL_FOLDER
        ? Effect.succeed(true)
        : fs
            .exists(agentFolder)
            .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: agentFolder })))
    },
    { concurrency: "unbounded" }
  )
})

/**
 * Removes the `adamantite` entry that `npx skills add` records in the project's `skills-lock.json`,
 * so the `skills` CLI no longer writes the folders that Adamantite owns. Deletes the lock when that
 * entry was its only one. Returns whether the lock changed.
 */
export const removeSkillsLockEntry = Effect.fn("removeSkillsLockEntry")(function* (cwd: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const lockPath = path.join(cwd, "skills-lock.json")
  const content = yield* readFileIfExists(lockPath)

  if (Option.isNone(content)) {
    return false
  }

  const lock = yield* Effect.fromResult(Jsonc.parse(content.value)).pipe(
    Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json)),
    Effect.mapError((cause) => new FailedToParseFile({ cause, path: lockPath }))
  )

  if (!checkIsJsonObject(lock) || !checkIsJsonObject(lock.skills)) {
    return false
  }

  const { [SKILL_NAME]: entry, ...skills } = lock.skills

  if (Predicate.isUndefined(entry)) {
    return false
  }

  if (Object.keys(skills).length === 0) {
    yield* fs
      .remove(lockPath)
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: lockPath })))

    return true
  }

  yield* writeJsonFile(lockPath, Object.fromEntries([...Object.entries(lock), ["skills", skills]]))

  return true
})
