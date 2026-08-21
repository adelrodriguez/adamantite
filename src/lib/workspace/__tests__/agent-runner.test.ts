import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandRunner, type CommandRunOptions } from "#lib/execution/command-runner.ts"
import { AgentRunner } from "#lib/workspace/agent-runner.ts"

function provideAgentRunner(invocations: CommandRunOptions[]) {
  const commandRunner = Layer.succeed(CommandRunner)({
    run: (options) =>
      Effect.sync(() => {
        invocations.push(options)
        return ChildProcessSpawner.ExitCode(options.command === "claude" ? 1 : 0)
      }),
  })
  const spawner = Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
    ChildProcessSpawner.make(() => Effect.die("The fake CommandRunner must not spawn a process"))
  )

  return Effect.provide(
    Layer.mergeAll(AgentRunner.layer.pipe(Layer.provide(commandRunner)), spawner)
  )
}

describe("AgentRunner", () => {
  it.effect("detect available harnesses through their version commands", () => {
    const invocations: CommandRunOptions[] = []

    return Effect.gen(function* () {
      const runner = yield* AgentRunner

      expect(yield* runner.detect()).toEqual(["codex"])
      expect(invocations.map(({ command }) => command)).toEqual(["claude", "codex"])
    }).pipe(provideAgentRunner(invocations))
  })

  it.effect("build commands with edit-level permissions", () =>
    Effect.gen(function* () {
      const runner = yield* AgentRunner
      const claude = runner.getCommand("claude", "repair prompt")
      const codex = runner.getCommand("codex", "repair prompt")

      expect(claude.args).toContain("acceptEdits")
      expect(claude.args).not.toContain("--dangerously-skip-permissions")
      expect(codex.args).toContain("workspace-write")
      expect(codex.args).not.toContain("--dangerously-bypass-approvals-and-sandbox")
    }).pipe(provideAgentRunner([]))
  )
})
