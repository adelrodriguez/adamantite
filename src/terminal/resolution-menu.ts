import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { type CodingAgent, CodingAgents, codingAgents } from "#lib/execution/coding-agents.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"

interface ResolutionMenuOptions {
  /**
   * The command's display name, such as `Doctor`, in "Exit the agent to return to Doctor."
   */
  readonly command: string
  readonly cwd: string
  /**
   * The question of the resolution menu.
   */
  readonly message: string
  readonly prompt: string
  /**
   * What the command hands off, such as `findings`, in "Doctor can hand findings off when…"
   */
  readonly subject: string
}

class PromptCopied extends Data.TaggedClass("Copied") {}

class ResolutionDeclined extends Data.TaggedClass("Declined") {}

/**
 * The handoff ran and the agent session ended.
 */
export class AgentSessionEnded extends Data.TaggedClass("Ended")<{
  readonly agent: CodingAgent
}> {}

/**
 * The agent CLI did not start.
 */
class AgentStartFailed extends Data.TaggedClass("Failed")<{ readonly agent: CodingAgent }> {}

type ResolveAction = CodingAgent | "copy" | "done"

const copyPrompt = Effect.fn("copyPrompt")(function* (prompt: string) {
  const prompter = yield* Prompter
  const terminal = yield* TerminalCapabilities

  yield* prompter.message(prompt)
  yield* terminal.copyToClipboard(prompt)
  yield* prompter.log.success(
    "The agent prompt is printed above and sent to the terminal clipboard."
  )
})

export const offerPromptCopy = Effect.fn("offerPromptCopy")(function* (prompt: string) {
  const prompter = yield* Prompter

  const shouldCopyPrompt = yield* prompter.confirm({
    initialValue: true,
    message: "Copy the agent prompt?",
  })

  if (shouldCopyPrompt) {
    yield* copyPrompt(prompt)
  }
})

/**
 * Offers a handoff to each installed coding agent, a copy of the Markdown prompt, or nothing, and
 * runs the choice. When the agent CLI does not start, it offers the prompt copy instead. It returns
 * the user's choice, and the command decides what happens next.
 */
export const chooseResolution = Effect.fn("chooseResolution")(function* (
  options: ResolutionMenuOptions
) {
  const agents = yield* CodingAgents
  const prompter = yield* Prompter

  const installedAgents = yield* prompter.withSpinner(() => agents.detectInstalled(options.cwd), {
    failure: "Could not check for installed coding agents.",
    start: "Checking for installed coding agents...",
    success: (detected) =>
      detected.length === 0
        ? "No supported coding agent was found on PATH."
        : `Found ${detected.map((agent) => agent.name).join(", ")}.`,
  })

  if (installedAgents.length === 0) {
    yield* prompter.log.info(
      `${options.command} can hand ${options.subject} off when one of these CLIs is installed: ${codingAgents
        .map((agent) => `\`${agent.command}\``)
        .join(", ")}.`
    )
  }

  const action = yield* prompter.select<ResolveAction>({
    message: options.message,
    options: [
      ...installedAgents.map((agent) => ({
        label: `Hand off to ${agent.name}`,
        value: agent,
      })),
      { label: "Copy the agent prompt", value: "copy" as const },
      { label: "Finish without an agent", value: "done" as const },
    ],
  })

  if (action === "done") {
    return new ResolutionDeclined()
  }

  if (action === "copy") {
    yield* copyPrompt(options.prompt)

    return new PromptCopied()
  }

  const agent = action

  yield* prompter.log.info(
    `Handing the terminal to ${agent.name}. Exit the agent to return to ${options.command}.`
  )

  const started = yield* agents.handoff({ agent, cwd: options.cwd, prompt: options.prompt }).pipe(
    Effect.as(true),
    Effect.catchTag("HandoffFailed", (error) =>
      prompter.log
        .error(
          error.reason === "not-found"
            ? `\`${agent.command}\` was not found on PATH. Install ${agent.name} or copy the prompt instead.`
            : `Failed to start ${agent.name}: ${error.cause.message}`
        )
        .pipe(Effect.as(false))
    )
  )

  if (!started) {
    yield* offerPromptCopy(options.prompt)

    return new AgentStartFailed({ agent })
  }

  return new AgentSessionEnded({ agent })
})
