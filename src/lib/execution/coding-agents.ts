import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
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

// "It spawned and exited" is the installation check: the probe ignores output and exit
// codes, so a CLI that prints its version oddly or exits nonzero still counts as
// installed. Any failure to run — the command missing from PATH, a permission or
// resource error, or a probe that hangs past the timeout — reads as not installed.
export const detectInstalledAgents = (cwd: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const probes = yield* Effect.forEach(
      codingAgents,
      (agent) =>
        runner
          .run({
            args: [...(agent.probeArguments ?? ["--version"])],
            command: agent.command,
            cwd,
            stderr: "ignore",
            stdout: "ignore",
          })
          .pipe(
            Effect.timeout("10 seconds"),
            Effect.as(agent),
            Effect.catch(() => Effect.succeed(null))
          ),
      { concurrency: codingAgents.length }
    )
    return probes.filter((agent) => agent !== null)
  })

// The findings themselves stay out of the seed prompt: the agent reads them by
// running non-interactive `adamantite doctor`, so nothing sensitive lands in argv.
export const handoffPrompt =
  "Run `adamantite doctor` — through your package runner, such as `npx` or `pnpm exec`, "
  + "if it is not on PATH — and resolve every finding it reports. "
  + "Rerun `adamantite doctor` until it exits 0."

// Lives here instead of lib/shared/errors.ts because it carries the runner failure,
// and shared must not depend on execution.
export class AgentSessionFailed extends Data.TaggedError("AgentSessionFailed")<{
  readonly cause: CommandFailedLike
  readonly reason: "not-found" | "spawn-failed"
}> {}

/**
 * Hands the terminal to the agent with inherited stdio, seeded to run Doctor itself. Resolves when
 * the session ends; the agent's exit code is deliberately discarded because only a reassessment can
 * judge whether the findings were repaired.
 */
export const runAgentSession = ({ agent, cwd }: { agent: CodingAgent; cwd: string }) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    yield* runner.run({
      args: agent.seedArguments(handoffPrompt),
      command: agent.command,
      cwd,
      stderr: "inherit",
      stdin: "inherit",
      stdout: "inherit",
    })
  }).pipe(
    Effect.asVoid,
    Effect.mapError(
      (error) =>
        new AgentSessionFailed({
          cause: error,
          reason: error._tag === "CliNotFound" ? "not-found" : "spawn-failed",
        })
    )
  )

type WorkingTreeState = "clean" | "dirty" | "unknown"

// Exit codes only: CommandRunner cannot capture output, and `git diff --quiet HEAD`
// answers cleanly through them (0 clean, 1 dirty, anything else no usable answer).
// Untracked-only trees read as clean; the handoff confirmation copy accepts that.
export const checkWorkingTreeState = (cwd: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const exitCode = yield* runner.run({
      args: ["diff", "--quiet", "HEAD"],
      command: "git",
      cwd,
      stderr: "ignore",
      stdout: "ignore",
    })

    if (exitCode === ChildProcessSpawner.ExitCode(0)) {
      return "clean" as const
    }
    if (exitCode === ChildProcessSpawner.ExitCode(1)) {
      return "dirty" as const
    }
    return "unknown" as const
  }).pipe(Effect.catch(() => Effect.succeed<WorkingTreeState>("unknown")))
