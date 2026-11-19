import process from "node:process"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Predicate from "effect/Predicate"
import type { CommandFailedLike } from "#lib/shared/command-runner.ts"
import { CommandRunner } from "#lib/shared/command-runner.ts"

export interface CodingAgent {
  readonly command: string
  readonly name: string
  // Grok Build documents only a `version` subcommand.
  readonly probeArguments?: readonly string[]
  // OpenCode only fills its input box with the prompt, so its handoff needs one Enter press.
  readonly seedArguments: (prompt: string) => string[]
  readonly skillsFolder: string
}

// Contract provenance (2026-08-27) — the seed and probe forms are third-party CLI
// contracts and can drift per vendor; re-verify an entry when its CLI majors:
// - claude, codex: positional interactive seed and `--version` per vendor docs,
//   confirmed against locally installed CLIs.
// - grok: `[PROMPT]` interactive seed and the `version` subcommand confirmed against
//   the shipped binary, grok 1.0.5 (5115b46bc9).
// - cursor-agent, gemini, opencode: forms from first-party docs; smoke test pending.
// The skill folders come from the agent table of the `skills` CLI, version 1.7.4.
export const codingAgents = [
  {
    command: "claude",
    name: "Claude Code",
    seedArguments: (prompt) => [prompt],
    skillsFolder: ".claude/skills",
  },
  {
    command: "codex",
    name: "Codex",
    seedArguments: (prompt) => [prompt],
    skillsFolder: ".agents/skills",
  },
  {
    command: "cursor-agent",
    name: "Cursor",
    seedArguments: (prompt) => [prompt],
    skillsFolder: ".agents/skills",
  },
  {
    command: "gemini",
    name: "Gemini CLI",
    seedArguments: (prompt) => ["-i", prompt],
    skillsFolder: ".agents/skills",
  },
  {
    command: "grok",
    name: "Grok Build",
    probeArguments: ["version"],
    seedArguments: (prompt) => [prompt],
    skillsFolder: ".grok/skills",
  },
  {
    command: "opencode",
    name: "OpenCode",
    seedArguments: (prompt) => ["--prompt", prompt],
    skillsFolder: ".agents/skills",
  },
] as const satisfies readonly CodingAgent[]

interface HandoffOptions {
  readonly agent: CodingAgent
  readonly cwd: string
  // The prompt travels in the arguments of the agent, so other local processes can read it.
  readonly prompt: string
}

export class HandoffFailed extends Data.TaggedError("HandoffFailed")<{
  readonly cause: CommandFailedLike
  readonly reason: "not-found" | "spawn-failed"
}> {}

function ignoreSigint() {
  // Adamantite stays alive; the agent in the foreground process group handles the signal.
}

// The agent stays in the foreground process group, so a terminal SIGINT also reaches this process,
// and the finalizer of the Effect spawner would kill the agent mid-edit.
const sigintShield = Effect.acquireRelease(
  Effect.sync(() => {
    const previous = process.listeners("SIGINT")
    process.removeAllListeners("SIGINT")
    // With no listener at all, Node's default SIGINT behavior kills the process.
    process.on("SIGINT", ignoreSigint)

    return previous
  }),
  (previous) =>
    Effect.sync(() => {
      process.removeAllListeners("SIGINT")

      for (const listener of previous) {
        process.on("SIGINT", listener)
      }
    })
)

export class CodingAgents extends Context.Service<
  CodingAgents,
  {
    readonly detectInstalled: (cwd: string) => Effect.Effect<CodingAgent[]>
    readonly handoff: (options: HandoffOptions) => Effect.Effect<void, HandoffFailed>
  }
>()("CodingAgents") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const runner = yield* CommandRunner

      const isInstalled = (agent: CodingAgent, cwd: string) =>
        runner
          .exitCode({
            args: [...(agent.probeArguments ?? ["--version"])],
            command: agent.command,
            cwd,
            stderr: "ignore",
            stdout: "ignore",
          })
          .pipe(Effect.timeout("10 seconds"), Effect.isSuccess)

      return CodingAgents.of({
        detectInstalled: Effect.fn("CodingAgents.detectInstalled")((cwd) =>
          // `Effect.filter` keeps the input order, also when the probes finish out of order.
          Effect.filter(codingAgents, (agent) => isInstalled(agent, cwd), {
            concurrency: "unbounded",
          })
        ),
        handoff: Effect.fn("CodingAgents.handoff")(
          function* ({ agent, cwd, prompt }) {
            yield* sigintShield
            yield* runner.exitCode({
              args: agent.seedArguments(prompt),
              command: agent.command,
              cwd,
              stderr: "inherit",
              stdin: "inherit",
              stdout: "inherit",
            })
          },
          Effect.scoped,
          Effect.mapError(
            (cause) =>
              new HandoffFailed({
                cause,
                reason: Predicate.isTagged(cause, "CliNotFound") ? "not-found" : "spawn-failed",
              })
          )
        ),
      })
    })
  )
}
