import process from "node:process"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import { TestClock } from "effect/testing"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { type CodingAgent, CodingAgents, codingAgents } from "#lib/execution/coding-agents.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"

const claudeAgent: CodingAgent = {
  command: "claude",
  name: "Claude Code",
  seedArguments: (prompt) => [prompt],
}

const sentinel = () => {
  // Stands in for the runtime's SIGINT listener; only its identity matters.
}

describe("CodingAgents.runSession", () => {
  it.effect("ignore SIGINT while the agent session runs and restore listeners afterwards", () =>
    Effect.gen(function* () {
      process.on("SIGINT", sentinel)

      let listenersDuringRun: unknown[] = []
      const runner = Layer.succeed(
        CommandRunner,
        CommandRunner.make(() =>
          Effect.sync(() => {
            listenersDuringRun = process.listeners("SIGINT")
            return ChildProcessSpawner.ExitCode(0)
          })
        )
      )
      yield* Effect.gen(function* () {
        const agents = yield* CodingAgents
        yield* agents.runSession({ agent: claudeAgent, cwd: "/project", prompt: "prompt" })
      }).pipe(Effect.provide(CodingAgents.layer.pipe(Layer.provide(runner))))

      const listenersAfterRun = process.listeners("SIGINT")
      process.removeListener("SIGINT", sentinel)

      expect(listenersDuringRun).not.toContain(sentinel)
      expect(listenersDuringRun).toHaveLength(1)
      expect(listenersAfterRun).toContain(sentinel)
    })
  )
})

describe("CodingAgents.detectInstalled", () => {
  it.effect("return installed agents in registry order when probes finish out of order", () =>
    Effect.gen(function* () {
      // Later registry entries answer sooner, so completion order is the reverse of menu order.
      const runner = Layer.succeed(
        CommandRunner,
        CommandRunner.make(({ command }) =>
          Effect.sleep(
            `${codingAgents.length - codingAgents.findIndex((agent) => agent.command === command)} seconds`
          ).pipe(Effect.as(ChildProcessSpawner.ExitCode(0)))
        )
      )

      const fiber = yield* Effect.gen(function* () {
        const agents = yield* CodingAgents
        return yield* agents.detectInstalled("/project")
      }).pipe(Effect.provide(CodingAgents.layer.pipe(Layer.provide(runner))), Effect.forkChild)

      yield* TestClock.adjust("9 seconds")
      const installed = yield* Fiber.join(fiber)

      expect(installed.map((agent) => agent.command)).toEqual(
        codingAgents.map((agent) => agent.command)
      )
    })
  )
})
