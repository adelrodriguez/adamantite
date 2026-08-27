import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandRunner } from "#lib/execution/command-runner.ts"

export interface CodingAgent {
  readonly command: string
  readonly id: "claude" | "codex"
  readonly name: string
}

export const codingAgents: readonly CodingAgent[] = [
  { command: "claude", id: "claude", name: "Claude Code" },
  { command: "codex", id: "codex", name: "Codex" },
]

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
