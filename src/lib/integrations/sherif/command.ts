import type { CommandRunOptions } from "#lib/execution/command-runner.ts"

export function analyze(options: {
  readonly cwd: string
  readonly fix: boolean
  readonly forwardedArguments: readonly string[]
}): CommandRunOptions {
  return {
    args: [...(options.fix ? ["--fix"] : []), ...options.forwardedArguments],
    command: "sherif",
    cwd: options.cwd,
    // Sherif prompts for a version when a fix has more than one candidate.
    stdin: "inherit",
    title: "📦 Analyzing the monorepo",
  }
}
