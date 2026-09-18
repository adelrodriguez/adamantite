import * as Effect from "effect/Effect"
import type { RepairResult } from "#lib/agent-repair/loop.ts"
import {
  type CodingAgent,
  type CodingAgentId,
  detectAgent,
  getCodingAgent,
  renderAgentNotFound,
} from "#lib/agent-repair/driver.ts"
import { Prompter } from "#terminal/prompter.ts"

/**
 * Warns when the agent cannot apply the permission limit that `restriction` names.
 */
export const warnUnenforcedPermissions = Effect.fn("warnUnenforcedPermissions")(function* (
  agent: CodingAgent,
  restriction: string
) {
  if (!agent.enforcesPermissions) {
    const prompter = yield* Prompter
    yield* prompter.log.warning(
      `${agent.name} cannot enforce ${restriction}. Review its edits before keeping them.`
    )
  }
})

/**
 * Resolves the agent that `--agent` names. Reports a missing CLI and returns null, so a run does
 * not spend its attempts on a command that cannot start.
 */
export const requireCodingAgent = Effect.fn("requireCodingAgent")(function* (
  id: CodingAgentId,
  cwd: string
) {
  const prompter = yield* Prompter
  const agent = yield* detectAgent(id, cwd)

  if (agent === null) {
    yield* prompter.log.error(renderAgentNotFound(getCodingAgent(id)))
  }

  return agent
})

/**
 * Prints the reason for each failed attempt, such as a timeout or the agent's captured stderr.
 */
export const printRepairNotes = Effect.fn("printRepairNotes")(function* (
  results: ReadonlyArray<RepairResult<unknown>>
) {
  const prompter = yield* Prompter

  for (const note of new Set(results.flatMap((result) => result.notes))) {
    yield* prompter.log.warning(note)
  }
})
