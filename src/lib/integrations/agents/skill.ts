import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { codingAgents } from "#lib/handoff/coding-agents.ts"
import { FailedToReadFile } from "#lib/shared/errors.ts"

/**
 * A project folder that coding agents load skills from, such as `.agents/skills`.
 */
type SkillFolder = (typeof codingAgents)[number]["skillsFolder"]

/**
 * Each skill folder once, in alphabetical order, which puts the shared `.agents/skills` first.
 */
export const skillFolders: readonly SkillFolder[] = Array.sort(
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
