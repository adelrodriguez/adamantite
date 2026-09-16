import type * as PlatformError from "effect/PlatformError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CliNotFound, CommandFailed } from "#lib/shared/errors.ts"

export interface CommandRunOptions {
  readonly args: string[]
  readonly command: string
  readonly cwd?: string
  /**
   * The platform spawner defaults to a new session on POSIX. Pass `false` to keep the child in this
   * process's group so terminal-generated signals reach it.
   */
  readonly detached?: boolean
  readonly stderr?: "ignore" | "inherit"
  readonly stdin?: "ignore" | "inherit"
  readonly stdout?: "ignore" | "inherit"
}

export type CommandFailedLike = CliNotFound | PlatformError.PlatformError

interface CommandRunnerService {
  readonly run: (
    options: CommandRunOptions
  ) => Effect.Effect<
    ChildProcessSpawner.ExitCode,
    CommandFailedLike,
    ChildProcessSpawner.ChildProcessSpawner
  >
  readonly runOrFail: (
    options: CommandRunOptions
  ) => Effect.Effect<
    void,
    CommandFailed | CommandFailedLike,
    ChildProcessSpawner.ChildProcessSpawner
  >
}

const run = Effect.fn("CommandRunner.run")(function* ({
  args,
  command,
  cwd,
  detached,
  stderr = "inherit",
  stdin = "ignore",
  stdout = "inherit",
}: CommandRunOptions) {
  return yield* Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(command, args, {
        cwd,
        detached,
        stderr,
        stdin,
        stdout,
      })

      return yield* handle.exitCode
    })
  ).pipe(
    Effect.mapError((cause) =>
      cause.reason._tag === "NotFound" ? new CliNotFound({ command }) : cause
    )
  )
})

export class CommandRunner extends Context.Service<CommandRunner, CommandRunnerService>()(
  "CommandRunner"
) {
  static make(run: CommandRunnerService["run"]): CommandRunnerService {
    return {
      run,
      runOrFail: Effect.fn("CommandRunner.runOrFail")(function* (options) {
        const exitCode = yield* run(options)

        if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
          yield* new CommandFailed({ command: options.command, exitCode })
        }
      }),
    }
  }

  static readonly layer = Layer.succeed(this)(this.make(run))
}
