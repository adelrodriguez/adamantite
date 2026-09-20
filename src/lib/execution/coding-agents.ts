import process from "node:process"
import * as Context from "effect/Context"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import type { CommandFailedLike } from "#lib/execution/command-runner.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"

export interface CodingAgent {
  readonly command: string
  readonly name: string
  /**
   * Arguments for the installation probe. Defaults to `--version`; Grok Build only documents a
   * `version` subcommand.
   */
  readonly probeArguments?: readonly string[]
  /**
   * Arguments that start the CLI's interactive session seeded with the prompt. OpenCode only
   * pre-fills its input box, so that handoff needs one Enter press.
   */
  readonly seedArguments: (prompt: string) => string[]
}

// Contract provenance (2026-08-27) — the seed and probe forms are third-party CLI
// contracts and can drift per vendor; re-verify an entry when its CLI majors:
// - claude, codex: positional interactive seed and `--version` per vendor docs,
//   confirmed against locally installed CLIs.
// - grok: `[PROMPT]` interactive seed and the `version` subcommand confirmed against
//   the shipped binary, grok 1.0.5 (5115b46bc9).
// - cursor-agent, gemini, opencode: forms from first-party docs; smoke test pending.
export const codingAgents: readonly CodingAgent[] = [
  { command: "claude", name: "Claude Code", seedArguments: (prompt) => [prompt] },
  { command: "codex", name: "Codex", seedArguments: (prompt) => [prompt] },
  { command: "cursor-agent", name: "Cursor", seedArguments: (prompt) => [prompt] },
  { command: "gemini", name: "Gemini CLI", seedArguments: (prompt) => ["-i", prompt] },
  {
    command: "grok",
    name: "Grok Build",
    probeArguments: ["version"],
    seedArguments: (prompt) => [prompt],
  },
  { command: "opencode", name: "OpenCode", seedArguments: (prompt) => ["--prompt", prompt] },
]

export interface AgentSessionOptions {
  readonly agent: CodingAgent
  readonly cwd: string
  /**
   * Travels in the agent's argv, so other local processes can read it for the session.
   */
  readonly prompt: string
}

// Lives here instead of lib/shared/errors.ts because it carries the runner failure,
// and shared must not depend on execution.
export class AgentSessionFailed extends Data.TaggedError("AgentSessionFailed")<{
  readonly cause: CommandFailedLike
  readonly reason: "not-found" | "spawn-failed"
}> {}

const ignoreSigint = () => {
  // Doctor stays alive; the agent in the foreground process group handles the signal.
}

// While the agent owns the terminal, Ctrl-C is the agent's to handle. The session is
// spawned with `detached: false` so the agent joins Doctor's foreground process group
// (the platform spawner would otherwise start it in a new session on POSIX, cutting it
// off from terminal-generated SIGINT and SIGWINCH). Sharing the group means the same
// SIGINT also reaches Doctor's runtime, whose spawner finalizer would kill the agent
// mid-edit — this shield discards it until the enclosing scope closes.
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
    /**
     * The supported agents whose CLI starts on this machine, in menu order.
     */
    readonly detectInstalled: (cwd: string) => Effect.Effect<CodingAgent[]>
    /**
     * Hands the terminal to the agent with inherited stdio, seeded with the prompt. Resolves when
     * the session ends; the agent's exit code is deliberately discarded because only a reassessment
     * can judge whether the findings were repaired. Doctor ignores SIGINT for the duration of the
     * session so a Ctrl-C reaches only the agent.
     */
    readonly runSession: (options: AgentSessionOptions) => Effect.Effect<void, AgentSessionFailed>
  }
>()("CodingAgents") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const runner = yield* CommandRunner

      // "It spawned and exited" is the installation check: the probe ignores output and exit
      // codes, so a CLI that prints its version oddly or exits nonzero still counts as
      // installed. Any failure to run — the command missing from PATH, a permission or
      // resource error, or a probe that hangs past the timeout — reads as not installed.
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
          // `Effect.filter` collects in completion order under concurrency; `forEach` keeps
          // the registry order the menu depends on.
          Effect.forEach(codingAgents, (agent) => isInstalled(agent, cwd), {
            concurrency: "unbounded",
          }).pipe(Effect.map((installed) => codingAgents.filter((_, index) => installed[index])))
        ),
        runSession: Effect.fn("CodingAgents.runSession")(
          function* ({ agent, cwd, prompt }) {
            yield* sigintShield
            yield* runner.exitCode({
              args: agent.seedArguments(prompt),
              command: agent.command,
              cwd,
              detached: false,
              stderr: "inherit",
              stdin: "inherit",
              stdout: "inherit",
            })
          },
          Effect.scoped,
          Effect.mapError(
            (cause) =>
              new AgentSessionFailed({
                cause,
                reason: cause._tag === "CliNotFound" ? "not-found" : "spawn-failed",
              })
          )
        ),
      })
    })
  )
}
