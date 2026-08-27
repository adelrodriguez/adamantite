import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandRunner } from "#lib/execution/command-runner.ts"

export interface CodingAgent {
  readonly command: string
  readonly id: "claude" | "codex" | "cursor" | "gemini" | "grok" | "opencode"
  readonly name: string
  /**
   * Arguments that start the CLI's interactive session seeded with the prompt. OpenCode only
   * pre-fills its input box, so that handoff needs one Enter press.
   */
  readonly seedArguments: (prompt: string) => string[]
}

export const codingAgents: readonly CodingAgent[] = [
  { command: "claude", id: "claude", name: "Claude Code", seedArguments: (prompt) => [prompt] },
  { command: "codex", id: "codex", name: "Codex", seedArguments: (prompt) => [prompt] },
  { command: "cursor-agent", id: "cursor", name: "Cursor", seedArguments: (prompt) => [prompt] },
  {
    command: "gemini",
    id: "gemini",
    name: "Gemini CLI",
    seedArguments: (prompt) => ["-i", prompt],
  },
  { command: "grok", id: "grok", name: "Grok Build", seedArguments: (prompt) => [prompt] },
  {
    command: "opencode",
    id: "opencode",
    name: "OpenCode",
    seedArguments: (prompt) => ["--prompt", prompt],
  },
]

// "It spawned" is the installation check: the probe ignores output and exit codes,
// so a CLI that prints its version oddly or exits nonzero still counts as installed.
// Only a spawn failure (the command is not on PATH) removes an agent from the menu.
export const detectInstalledAgents = (cwd: string) =>
  Effect.gen(function* () {
    const runner = yield* CommandRunner
    const probes = yield* Effect.forEach(
      codingAgents,
      (agent) =>
        runner
          .run({
            args: ["--version"],
            command: agent.command,
            cwd,
            stderr: "ignore",
            stdout: "ignore",
          })
          .pipe(
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
  "Run `adamantite doctor` and resolve every finding it reports. " +
  "Rerun `adamantite doctor` until it exits 0."

export type WorkingTreeState = "clean" | "dirty" | "unknown"

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
