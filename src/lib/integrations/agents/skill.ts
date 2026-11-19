import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { codingAgents } from "#lib/handoff/coding-agents.ts"
import { FailedToReadFile } from "#lib/shared/errors.ts"

type SkillFolder = (typeof codingAgents)[number]["skillsFolder"]

export const skillFolders: readonly SkillFolder[] = Array.sort(
  Array.dedupe(codingAgents.map((agent) => agent.skillsFolder)),
  Order.String
)

// Codex, Cursor, Gemini CLI, and OpenCode read this folder.
const SHARED_SKILL_FOLDER: SkillFolder = ".agents/skills"

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
