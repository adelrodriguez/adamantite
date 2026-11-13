import * as Prompt from "effect/cli/Prompt"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Terminal from "effect/Terminal"
import { type CodingAgent, CodingAgents, codingAgents } from "#lib/execution/coding-agents.ts"
import * as Output from "#terminal/output.ts"

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
  const terminal = yield* Terminal.Terminal

  yield* Console.log(prompt)
  // OSC 52 asks the terminal to put the text on the system clipboard. A terminal that cannot write
  // its own output cannot continue, so a failed write is a defect.
  yield* terminal
    .display(`\u001B]52;c;${Buffer.from(prompt).toString("base64")}\u0007`)
    .pipe(Effect.orDie)
  yield* Output.success("The agent prompt is printed above and sent to the terminal clipboard.")
})

export const offerPromptCopy = Effect.fn("offerPromptCopy")(function* (prompt: string) {
  const shouldCopyPrompt = yield* Prompt.Confirm({
    initial: true,
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
  const installedAgents = yield* agents.detectInstalled(options.cwd)

  // The menu names each installed agent, so only an empty result needs a line.
  if (installedAgents.length === 0) {
    yield* Output.info(
      `No supported coding agent was found on PATH. ${options.command} can hand ${options.subject} off when one of these CLIs is installed: ${codingAgents
        .map((agent) => `\`${agent.command}\``)
        .join(", ")}.`
    )
  }

  const action = yield* Prompt.Select<ResolveAction>({
    choices: [
      ...installedAgents.map((agent) => ({ title: `Hand off to ${agent.name}`, value: agent })),
      { title: "Copy the agent prompt", value: "copy" },
      { title: "Finish without an agent", value: "done" },
    ],
    message: options.message,
  })

  if (action === "done") {
    return new ResolutionDeclined()
  }

  if (action === "copy") {
    yield* copyPrompt(options.prompt)

    return new PromptCopied()
  }

  const agent = action

  yield* Output.info(
    `Handing the terminal to ${agent.name}. Exit the agent to return to ${options.command}.`
  )

  const started = yield* agents.handoff({ agent, cwd: options.cwd, prompt: options.prompt }).pipe(
    Effect.as(true),
    Effect.catchTag("HandoffFailed", (error) =>
      Output.error(
        error.reason === "not-found"
          ? `\`${agent.command}\` was not found on PATH. Install ${agent.name} or copy the prompt instead.`
          : `Failed to start ${agent.name}: ${error.cause.message}`
      ).pipe(Effect.as(false))
    )
  )

  if (!started) {
    yield* offerPromptCopy(options.prompt)

    return new AgentStartFailed({ agent })
  }

  return new AgentSessionEnded({ agent })
})
