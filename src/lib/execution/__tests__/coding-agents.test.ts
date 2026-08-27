import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { type CodingAgent, runAgentSession } from "#lib/execution/coding-agents.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"

const claudeAgent: CodingAgent = {
  command: "claude",
  name: "Claude Code",
  seedArguments: (prompt) => [prompt],
}

const sentinel = () => {
  // Stands in for the runtime's SIGINT listener; only its identity matters.
}

describe("runAgentSession", () => {
  it.effect("ignore SIGINT while the agent session runs and restore listeners afterwards", () =>
    Effect.gen(function* () {
      process.on("SIGINT", sentinel)

      let listenersDuringRun: unknown[] = []
      const runner = Layer.succeed(CommandRunner)({
        run: () =>
          Effect.sync(() => {
            listenersDuringRun = process.listeners("SIGINT")
            return ChildProcessSpawner.ExitCode(0)
          }),
      })
      const spawner = Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
        ChildProcessSpawner.make(() =>
          Effect.die("runAgentSession tests stub CommandRunner instead of spawning processes")
        )
      )

      yield* runAgentSession({ agent: claudeAgent, cwd: "/project" }).pipe(
        Effect.provide(Layer.mergeAll(runner, spawner))
      )

      const listenersAfterRun = process.listeners("SIGINT")
      process.removeListener("SIGINT", sentinel)

      expect(listenersDuringRun).not.toContain(sentinel)
      expect(listenersDuringRun).toHaveLength(1)
      expect(listenersAfterRun).toContain(sentinel)
    })
  )
})
