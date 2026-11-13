import type { CommandRunOptions } from "#lib/execution/command-runner.ts"

export function analyze(options: {
  readonly cwd: string
  readonly fix: boolean
  readonly strict: boolean
  readonly forwardedArguments: readonly string[]
}): CommandRunOptions {
  return {
    args: [
      ...(options.fix ? ["--fix", "--allow-remove-files"] : []),
      ...(options.strict ? ["--production", "--strict"] : []),
      ...options.forwardedArguments,
    ],
    command: "knip",
    cwd: options.cwd,
    stdin: "ignore",
    title: "🧹 Analyzing unused code",
  }
}
