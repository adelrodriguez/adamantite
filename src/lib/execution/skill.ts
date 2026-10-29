import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Schema from "effect/Schema"
import { type CodingAgent, codingAgents } from "#lib/execution/coding-agents.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"
import { parseJson } from "#lib/shared/json.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const SKILL_NAME = "adamantite"

/**
 * The installed Adamantite package. The `skills` CLI copies the skill from it, so the copy matches
 * the installed Adamantite version. The CLI records this path in `skills-lock.json`.
 */
const SKILL_SOURCE = "./node_modules/adamantite"

const SKILLS_CLI = `skills@${getDependencyVersion("skills")}`

const SkillsLock = Schema.Struct({
  skills: Schema.Struct({
    [SKILL_NAME]: Schema.Struct({ source: Schema.Literal(SKILL_SOURCE) }),
  }),
})

function getSkillsAddArguments(agents: readonly CodingAgent[]) {
  return [
    "add",
    SKILL_SOURCE,
    "--skill",
    SKILL_NAME,
    ...agents.flatMap((agent) => ["--agent", agent.skillsAgent]),
    "--yes",
  ]
}

/**
 * The command that installs the skill by hand, for a warning after a failed install.
 */
export function getSkillInstallCommand(agents: readonly CodingAgent[]): string {
  return ["npx", SKILLS_CLI, ...getSkillsAddArguments(agents)].join(" ")
}

const readShippedSkill = Effect.fn("readShippedSkill")(function* (cwd: string) {
  const path = yield* Path.Path
  return yield* readFileIfExists(path.join(cwd, SKILL_SOURCE, "skills", SKILL_NAME, "SKILL.md"))
})

/**
 * Install the skill that the installed Adamantite package ships for each agent, with the `skills`
 * CLI. Returns `"missing"` when `node_modules` has no skill to copy, such as with Yarn
 * Plug'n'Play.
 */
export const installSkill = Effect.fn("installSkill")(function* (
  cwd: string,
  agents: readonly CodingAgent[]
) {
  if (Option.isNone(yield* readShippedSkill(cwd))) {
    return "missing" as const
  }

  const runner = yield* CommandRunner
  yield* runner.run({
    // In its default output mode, the CLI prints a failed skill copy but exits 0. JSON mode exits 1.
    args: ["--yes", SKILLS_CLI, ...getSkillsAddArguments(agents), "--json"],
    command: "npx",
    cwd,
    stderr: "ignore",
    stdout: "ignore",
  })

  return "installed" as const
})

/**
 * The agents whose copy of the skill differs from the skill that the installed Adamantite package
 * ships. Only a skill that `skills-lock.json` records from the installed package counts, so a skill
 * that the user installed from another source stays as it is.
 */
export const findStaleSkillAgents = Effect.fn("findStaleSkillAgents")(function* (cwd: string) {
  const path = yield* Path.Path
  const lock = yield* readFileIfExists(path.join(cwd, "skills-lock.json"))
  const shipped = yield* readShippedSkill(cwd)

  if (Option.isNone(lock) || Option.isNone(shipped)) {
    return []
  }

  if (!Schema.is(SkillsLock)(yield* parseJson(lock.value))) {
    return []
  }

  const copies = yield* Effect.forEach(
    codingAgents,
    (agent) =>
      readFileIfExists(path.join(cwd, agent.skillsFolder, SKILL_NAME, "SKILL.md")).pipe(
        Effect.map((copy: Option.Option<string>) =>
          pipe(
            copy,
            Option.map((content) => ({ agent, content }))
          )
        )
      ),
    { concurrency: "unbounded" }
  )
  const installed = Array.getSomes(copies)

  return installed.some(({ content }) => content !== shipped.value)
    ? installed.map(({ agent }) => agent)
    : []
})
