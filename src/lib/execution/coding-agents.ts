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
  /**
   * The agent's name for the `--agent` option of the `skills` CLI.
   */
  readonly skillsAgent: string
  /**
   * The project folder that the agent loads skills from.
   */
  readonly skillsFolder: string
}

// Contract provenance (2026-08-27) — the seed and probe forms are third-party CLI
// contracts and can drift per vendor; re-verify an entry when its CLI majors:
// - claude, codex: positional interactive seed and `--version` per vendor docs,
//   confirmed against locally installed CLIs.
// - grok: `[PROMPT]` interactive seed and the `version` subcommand confirmed against
//   the shipped binary, grok 1.0.5 (5115b46bc9).
// - cursor-agent, gemini, opencode: forms from first-party docs; smoke test pending.
// The skills agent names and folders come from the agent table of the `skills` CLI, version 1.7.4.
export const codingAgents = [
  {
    command: "claude",
    name: "Claude Code",
    seedArguments: (prompt) => [prompt],
    skillsAgent: "claude-code",
    skillsFolder: ".claude/skills",
  },
  {
    command: "codex",
    name: "Codex",
    seedArguments: (prompt) => [prompt],
    skillsAgent: "codex",
    skillsFolder: ".agents/skills",
  },
  {
    command: "cursor-agent",
    name: "Cursor",
    seedArguments: (prompt) => [prompt],
    skillsAgent: "cursor",
    skillsFolder: ".agents/skills",
  },
  {
    command: "gemini",
    name: "Gemini CLI",
    seedArguments: (prompt) => ["-i", prompt],
    skillsAgent: "gemini-cli",
    skillsFolder: ".agents/skills",
  },
  {
    command: "grok",
    name: "Grok Build",
    probeArguments: ["version"],
    seedArguments: (prompt) => [prompt],
    skillsAgent: "grok",
    skillsFolder: ".grok/skills",
  },
  {
    command: "opencode",
    name: "OpenCode",
    seedArguments: (prompt) => ["--prompt", prompt],
    skillsAgent: "opencode",
    skillsFolder: ".agents/skills",
  },
] as const satisfies readonly CodingAgent[]

export type SkillsAgent = (typeof codingAgents)[number]["skillsAgent"]

export interface HandoffOptions {
  readonly agent: CodingAgent
  readonly cwd: string
  /**
   * Travels in the agent's argv, so other local processes can read it for the session.
   */
  readonly prompt: string
}

export class HandoffFailed extends Data.TaggedError("HandoffFailed")<{
  readonly cause: CommandFailedLike
  readonly reason: "not-found" | "spawn-failed"
}> {}

const ignoreSigint = () => {
  // Adamantite stays alive; the agent in the foreground process group handles the signal.
}

// The session spawns with `detached: false`, so the agent joins Adamantite's foreground process
// group and gets terminal SIGINT and SIGWINCH. On POSIX, the platform spawner otherwise starts it
// in a new session. The same SIGINT also reaches Adamantite's runtime, whose spawner finalizer
// would kill the agent mid-edit. This shield ignores SIGINT until the enclosing scope closes.
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
     * the session ends; the agent's exit code is deliberately discarded because only the command
     * can judge the result, such as Doctor's reassessment. Adamantite ignores SIGINT for the
     * duration of the session so a Ctrl-C reaches only the agent.
     */
    readonly handoff: (options: HandoffOptions) => Effect.Effect<void, HandoffFailed>
  }
>()("CodingAgents") {
  static readonly layer = Layer.effect(
    this,
    Effect.gen(function* () {
      const runner = yield* CommandRunner

      // A CLI that starts and exits is installed, whatever its output or exit code. A CLI that does
      // not start, or that runs past the timeout, is not installed.
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
        handoff: Effect.fn("CodingAgents.handoff")(
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
              new HandoffFailed({
                cause,
                reason: cause._tag === "CliNotFound" ? "not-found" : "spawn-failed",
              })
          )
        ),
      })
    })
  )
}
