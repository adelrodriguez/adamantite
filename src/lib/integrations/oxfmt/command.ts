import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { CommandRunOptions } from "#lib/shared/command-runner.ts"
import { resolvePackageDirectory } from "#lib/project/module-resolver.ts"
import { PackageNotInstalled } from "#lib/shared/errors.ts"

interface Options {
  readonly cwd: string
  readonly files: readonly string[]
  readonly forwardedArguments: readonly string[]
}

/**
 * The Oxfmt CLI module that the project at `cwd` installs, or none when the project installs no
 * Oxfmt. Oxfmt's `bin/oxfmt` only imports this module, so Node.js can start it directly, as it
 * starts Oxlint's `dist/cli.js`.
 */
export const findOxfmtCli = Effect.fn("findOxfmtCli")(function* (cwd: string) {
  const path = yield* Path.Path
  const oxfmt = yield* resolvePackageDirectory(cwd, "oxfmt")

  return Option.map(oxfmt, (directory) => path.join(directory, "dist", "cli.js"))
})

/**
 * The command that runs the project's Oxfmt CLI with `args`. Node.js starts the CLI module itself,
 * which skips the shell script that a package manager puts in `node_modules/.bin`.
 */
const makeCommand = Effect.fn("makeCommand")(function* (
  cwd: string,
  args: readonly string[],
  title: string
) {
  const cli = yield* findOxfmtCli(cwd).pipe(
    Effect.flatMap(
      Option.match({
        onNone: () => Effect.fail(new PackageNotInstalled({ packageName: "oxfmt", project: cwd })),
        onSome: Effect.succeed,
      })
    )
  )

  return {
    args: [cli, ...args],
    command: "node",
    cwd,
    name: "oxfmt",
    title,
  } satisfies CommandRunOptions
})

export function check(options: Options) {
  return makeCommand(
    options.cwd,
    ["--check", ...options.files, ...options.forwardedArguments],
    "✨ Checking formatting"
  )
}

export function fix(options: Options) {
  return makeCommand(
    options.cwd,
    ["--write", ...options.files, ...options.forwardedArguments],
    "✨ Formatting"
  )
}

/**
 * Formats the content on stdin as Oxfmt formats the file at `path` with `config`, and prints the
 * result. Node.js starts `cli`, the Oxfmt CLI module that the project installs, because a package
 * runner, such as `pnpm dlx`, does not put the project's `node_modules/.bin` on `PATH`.
 */
export function format(options: {
  readonly cli: string
  readonly config: string
  readonly cwd: string
  readonly path: string
}): CommandRunOptions {
  return {
    args: [options.cli, "--config", options.config, `--stdin-filepath=${options.path}`],
    command: "node",
    cwd: options.cwd,
    name: "oxfmt",
  }
}
