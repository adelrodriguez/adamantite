import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import { codingAgents } from "#lib/execution/coding-agents.ts"
import { getShippedSkillFiles } from "#lib/execution/skill.macro.ts" with { type: "macro" }
import { FailedToReadFile, FailedToWriteFile } from "#lib/shared/errors.ts"
import {
  ensureDirectory,
  readDirectoryIfExists,
  readFile,
  readFileIfExists,
  writeFile,
  writeJsonFile,
} from "#lib/shared/filesystem.ts"
import { checkIsJsonObject, parseJson } from "#lib/shared/json.ts"

const SKILL_NAME = "adamantite"

/**
 * The skill that this Adamantite build ships, keyed by POSIX paths relative to the skill folder.
 */
const shippedSkill = getShippedSkillFiles()

/**
 * A project folder that coding agents load skills from, such as `.agents/skills`.
 */
type SkillFolder = (typeof codingAgents)[number]["skillsFolder"]

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

const readSkillCopy = Effect.fn("readSkillCopy")(function* (directory: string) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const entries = yield* readDirectoryIfExists(directory, { recursive: true })

  if (Option.isNone(entries)) {
    return Option.none()
  }

  const files = yield* Effect.forEach(
    entries.value,
    (entry) =>
      Effect.gen(function* () {
        const target = path.join(directory, entry)

        const info = yield* fs
          .stat(target)
          .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: target })))

        return info.type === "File"
          ? Option.some([entry.split(path.sep).join("/"), yield* readFile(target)] as const)
          : Option.none()
      }),
    { concurrency: "unbounded" }
  )

  return Option.some(Object.fromEntries(Array.getSomes(files)))
})

function matchesShippedSkill(copy: Readonly<Record<string, string>>) {
  const shipped = Object.entries(shippedSkill)

  return (
    Object.keys(copy).length === shipped.length
    && shipped.every(([file, content]) => copy[file] === content)
  )
}

const getSkillDirectory = Effect.fn("getSkillDirectory")(function* (
  cwd: string,
  folder: SkillFolder
) {
  const path = yield* Path.Path

  return path.join(cwd, folder, SKILL_NAME)
})

/**
 * The folders whose `adamantite` skill differs from the skill that this build ships, in any file. A
 * folder without the skill is not stale.
 */
export const findStaleSkillFolders = Effect.fn("findStaleSkillFolders")(function* (cwd: string) {
  const copies = yield* Effect.forEach(
    skillFolders,
    (folder) =>
      getSkillDirectory(cwd, folder).pipe(
        Effect.flatMap((directory) => readSkillCopy(directory)),
        Effect.map((copy) => ({ copy, folder }))
      ),
    { concurrency: "unbounded" }
  )

  return copies
    .filter(({ copy }) => Option.isSome(copy) && !matchesShippedSkill(copy.value))
    .map(({ folder }) => folder)
})

/**
 * Writes the skill that this build ships to each folder. A folder that already has the shipped
 * skill stays as it is. Any other copy is replaced, so files that the shipped skill no longer has
 * go away.
 */
export const writeSkill = Effect.fn("writeSkill")(function* (
  cwd: string,
  folders: readonly SkillFolder[]
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path

  for (const folder of folders) {
    const directory = yield* getSkillDirectory(cwd, folder)
    const copy = yield* readSkillCopy(directory)

    if (Option.isSome(copy) && matchesShippedSkill(copy.value)) {
      continue
    }

    yield* fs
      .remove(directory, { force: true, recursive: true })
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: directory })))

    for (const [file, content] of Object.entries(shippedSkill)) {
      const target = path.join(directory, ...file.split("/"))
      yield* ensureDirectory(path.dirname(target))
      yield* writeFile(target, content)
    }
  }
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

  const lock = yield* parseJson(content.value, lockPath)

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

  yield* writeJsonFile(lockPath, { ...lock, skills })

  return true
})
