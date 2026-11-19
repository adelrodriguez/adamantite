import * as Prompt from "effect/cli/Prompt"
import * as Console from "effect/Console"
import * as Data from "effect/Data"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Terminal from "effect/Terminal"
import { type CodingAgent, CodingAgents, codingAgents } from "#lib/handoff/coding-agents.ts"
import * as Project from "#lib/project/index.ts"
import * as Output from "#terminal/output.ts"

interface ResolutionMenuOptions {
  readonly command: string
  readonly message: string
  readonly prompt: string
  readonly subject: string
}

class PromptCopied extends Data.TaggedClass("Copied") {}

class ResolutionDeclined extends Data.TaggedClass("Declined") {}

export class AgentSessionEnded extends Data.TaggedClass("Ended")<{
  readonly agent: CodingAgent
}> {}

class AgentStartFailed extends Data.TaggedClass("Failed")<{ readonly agent: CodingAgent }> {}

type ResolveAction = CodingAgent | "copy" | "done"

const copyPrompt = Effect.fn("copyPrompt")(function* (prompt: string) {
  const terminal = yield* Terminal.Terminal

  yield* Console.log(prompt)
  // OSC 52 asks the terminal to put the text on the system clipboard.
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

// Effect's Node terminal turns raw mode off 10 ms after the last prompt ends, and does not wait for
// that release, which would turn off the raw mode of an agent that started before it. Effect keeps
// the delay because a quick raw mode toggle between prompts can hang a Windows TTY
// (https://github.com/Effect-TS/effect/pull/7106).
export const RAW_MODE_RELEASE_WAIT = Duration.millis(200)

export const chooseResolution = Effect.fn("chooseResolution")(function* (
  options: ResolutionMenuOptions
) {
  const cwd = yield* Project.Directory
  const agents = yield* CodingAgents
  const installedAgents = yield* agents.detectInstalled(cwd)

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

  yield* Effect.sleep(RAW_MODE_RELEASE_WAIT)

  const started = yield* agents.handoff({ agent, cwd, prompt: options.prompt }).pipe(
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
    yield* copyPrompt(options.prompt)

    return new AgentStartFailed({ agent })
  }

  return new AgentSessionEnded({ agent })
})
