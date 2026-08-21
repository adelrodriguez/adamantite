import * as Effect from "effect/Effect"
import type { Finding } from "#lib/integrations/base.ts"
import { renderFindingsPrompt } from "#lib/shared/findings.ts"
import { type AgentHarness, AgentRunner } from "#lib/workspace/agent-runner.ts"
import { GitStatus } from "#lib/workspace/git-status.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"

export type FindingActionResult =
  | { readonly kind: "reassessed"; readonly findings: readonly Finding[] }
  | { readonly kind: "unchanged" }

function formatCommand(command: string, args: readonly string[]): string {
  return [command, ...args].map((part) => JSON.stringify(part)).join(" ")
}

export const offerFindingActions = Effect.fn("offerFindingActions")(function* <E, R>(options: {
  readonly adamantiteVersion: string
  readonly cwd: string
  readonly findings: readonly Finding[]
  readonly reassess: () => Effect.Effect<readonly Finding[], E, R>
}) {
  const terminal = yield* TerminalCapabilities

  if (!(yield* terminal.isInteractive)) {
    return { kind: "unchanged" } satisfies FindingActionResult
  }

  const prompter = yield* Prompter
  const agentRunner = yield* AgentRunner
  const availableHarnesses = yield* agentRunner.detect()
  const prompt = renderFindingsPrompt(options.findings, options.adamantiteVersion)
  const choice = yield* prompter.select<AgentHarness | "prompt">({
    message: "How would you like to handle these findings?",
    options: [
      ...availableHarnesses.map((harness) => ({
        label: harness === "claude" ? "Fix with Claude Code" : "Fix with Codex",
        value: harness,
      })),
      { label: "Get the prompt", value: "prompt" },
    ],
  })

  if (choice === "prompt") {
    yield* prompter.log.info(prompt)
    yield* terminal.copyToClipboard(prompt)
    yield* prompter.log.success("The prompt was printed and sent to the terminal clipboard.")
    return { kind: "unchanged" } satisfies FindingActionResult
  }

  const gitStatus = yield* GitStatus

  if (yield* gitStatus.isDirty(options.cwd)) {
    yield* prompter.log.warning(
      "Adamantite could not confirm a clean working tree. The agent can overwrite or mix with existing changes."
    )
    const shouldContinue = yield* prompter.confirm({
      initialValue: false,
      message: "Run the agent with this dirty working tree?",
    })

    if (!shouldContinue) {
      return { kind: "unchanged" } satisfies FindingActionResult
    }
  }

  const command = agentRunner.getCommand(choice, prompt)
  yield* prompter.log.info(`Running: ${formatCommand(command.command, command.args)}`)

  const exitCode = yield* prompter.withSpinner(() => agentRunner.run(choice, prompt, options.cwd), {
    failure: `${choice} failed to start.`,
    start: `Running ${choice}...`,
    success: (code) => `${choice} exited with code ${code}.`,
  })

  if (exitCode !== 0) {
    yield* prompter.log.warning(`${choice} did not complete the requested repair.`)
  }

  return {
    findings: yield* options.reassess(),
    kind: "reassessed",
  } satisfies FindingActionResult
})
