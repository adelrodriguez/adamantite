import type * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { type CommandFailedLike, CommandRunner } from "#lib/execution/command-runner.ts"

export type AgentHarness = "claude" | "codex"

export interface AgentCommand {
  readonly args: readonly string[]
  readonly command: AgentHarness
}

function getAgentCommand(harness: AgentHarness, prompt: string): AgentCommand {
  switch (harness) {
    case "claude":
      return {
        args: [
          "--print",
          "--permission-mode",
          "acceptEdits",
          "--allowedTools",
          "Edit,Write,Bash(adamantite doctor*),Bash(adamantite update*)",
          prompt,
        ],
        command: "claude",
      }
    case "codex":
      return {
        args: ["exec", "--approve-for-me", prompt],
        command: "codex",
      }
  }
}

interface AgentRunnerService {
  readonly detect: () => Effect.Effect<
    readonly AgentHarness[],
    never,
    ChildProcessSpawner.ChildProcessSpawner
  >
  readonly getCommand: (harness: AgentHarness, prompt: string) => AgentCommand
  readonly run: (
    harness: AgentHarness,
    prompt: string,
    cwd: string
  ) => Effect.Effect<
    ChildProcessSpawner.ExitCode,
    CommandFailedLike,
    ChildProcessSpawner.ChildProcessSpawner
  >
}

export class AgentRunner extends Context.Service<AgentRunner, AgentRunnerService>()("AgentRunner") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const commandRunner = yield* CommandRunner

      return AgentRunner.of({
        detect: Effect.fn("AgentRunner.detect")(function* () {
          const available: AgentHarness[] = []

          for (const harness of ["claude", "codex"] as const) {
            const exit = yield* commandRunner
              .run({
                args: ["--version"],
                command: harness,
                stderr: "ignore",
                stdout: "ignore",
              })
              .pipe(Effect.option)

            if (exit._tag === "Some" && exit.value === 0) {
              available.push(harness)
            }
          }

          return available
        }),
        getCommand: getAgentCommand,
        run: Effect.fn("AgentRunner.run")((harness, prompt, cwd) => {
          const command = getAgentCommand(harness, prompt)
          return commandRunner.run({
            args: [...command.args],
            command: command.command,
            cwd,
            stderr: "inherit",
            stdin: "inherit",
            stdout: "inherit",
          })
        }),
      })
    })
  )
}
