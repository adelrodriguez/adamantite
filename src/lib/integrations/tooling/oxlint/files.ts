import process from "node:process"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Stream from "effect/Stream"
import { getOxlintCommand } from "#lib/integrations/tooling/oxlint/entry.ts"
import { CliNotFound, TrialLintFailed } from "#lib/shared/errors.ts"

export const OxlintCommand = Context.Reference<typeof getOxlintCommand>(
  "adamantite/OxlintCommand",
  { defaultValue: () => getOxlintCommand }
)

/**
 * Oxlint and Oxfmt load TypeScript configs through Node, which warns about every typeless
 * `package.json` it reparses as ESM.
 */
function quietNodeOptions() {
  return [process.env["NODE_OPTIONS"], "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON"]
    .filter(Boolean)
    .join(" ")
}

/**
 * Runs Oxlint in `cwd`, with the Oxlint runtime of `project`. `output` has stdout and stderr
 * together, because Oxlint prints a config error to either stream.
 */
export const runOxlint = Effect.fn("runOxlint")(
  function* (cwd: string, args: readonly string[], project: string = cwd) {
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner
    const command = (yield* OxlintCommand)(project)

    const handle = yield* spawner.spawn(
      ChildProcess.make(command.command, [...command.args, ...args], {
        cwd,
        env: { ...command.env, NODE_OPTIONS: quietNodeOptions() },
        extendEnv: true,
        stdin: "ignore",
      })
    )

    const [stdout, stderr, exitCode] = yield* Effect.all(
      [
        Stream.mkString(Stream.decodeText(handle.stdout)),
        Stream.mkString(Stream.decodeText(handle.stderr)),
        handle.exitCode,
      ],
      { concurrency: "unbounded" }
    )

    return { exitCode, output: `${stdout}${stderr}`.trim(), stdout }
  },
  Effect.scoped,
  Effect.catchReason(
    "PlatformError",
    "NotFound",
    () => Effect.fail(new CliNotFound({ command: "node" })),
    (_reason, error) => Effect.fail(new TrialLintFailed({ output: error.message }))
  )
)

/**
 * The files that Oxlint lints in `cwd`, relative to `cwd` with `/` between folders: the given
 * `files`, or all files when none are given, without the files that an ignore pattern or
 * `.gitignore` matches.
 */
export const listLintedFiles = Effect.fn("listLintedFiles")(function* (
  cwd: string,
  files: readonly string[] = []
) {
  const { exitCode, output, stdout } = yield* runOxlint(cwd, ["--debug=files", ...files])

  if (exitCode !== 0) {
    return yield* new TrialLintFailed({ output })
  }

  return stdout
    .split("\n")
    .map((line) => line.trim().replaceAll("\\", "/"))
    .filter((line) => line.length > 0)
})
