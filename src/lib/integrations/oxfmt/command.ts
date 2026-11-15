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

/**
 * Formats the content on stdin as Oxfmt formats the file at `path` with `config`, and prints the
 * result. Node.js starts `bin`, the Oxfmt CLI that the project installs, because a package runner,
 * such as `pnpm dlx`, does not put the project's `node_modules/.bin` on `PATH`.
 */
export function format(options: {
  readonly bin: string
  readonly config: string
  readonly cwd: string
  readonly path: string
}): CommandRunOptions {
  return {
    args: [options.bin, "--config", options.config, `--stdin-filepath=${options.path}`],
    command: "node",
    cwd: options.cwd,
    name: "oxfmt",
  }
}
