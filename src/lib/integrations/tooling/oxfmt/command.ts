import type { CommandRunOptions } from "#lib/execution/command-runner.ts"

interface Options {
  readonly cwd: string
  readonly files: readonly string[]
  readonly forwardedArguments: readonly string[]
}

export function check(options: Options): CommandRunOptions {
  return {
    args: ["--check", ...options.files, ...options.forwardedArguments],
    command: "oxfmt",
    cwd: options.cwd,
    title: "✨ Checking formatting",
  }
}

export function fix(options: Options): CommandRunOptions {
  return {
    args: ["--write", ...options.files, ...options.forwardedArguments],
    command: "oxfmt",
    cwd: options.cwd,
    title: "✨ Formatting",
  }
}
