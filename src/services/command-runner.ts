import type * as PlatformError from "effect/PlatformError"
import type * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import { CliNotFound } from "#errors.ts"

export interface CommandRunOptions {
  readonly args: string[]
  readonly command: string
  readonly cwd?: string
  readonly stderr?: "ignore" | "inherit"
  readonly stdin?: "ignore" | "inherit"
  readonly stdout?: "ignore" | "inherit"
}

export type CommandFailedLike = CliNotFound | PlatformError.PlatformError

function mapCommandError(command: string, cause: PlatformError.PlatformError): CommandFailedLike {
  if (cause.reason._tag === "NotFound") {
    return new CliNotFound({ command })
  }

  return cause
}

export class CommandRunner extends ServiceMap.Service<
  CommandRunner,
  {
    readonly run: (
      options: CommandRunOptions
    ) => Effect.Effect<
      ChildProcessSpawner.ExitCode,
      CommandFailedLike,
      ChildProcessSpawner.ChildProcessSpawner
    >
  }
>()("CommandRunner") {
  static readonly layer = Layer.succeed(this)({
    run: ({ args, command, cwd, stderr = "inherit", stdin = "ignore", stdout = "inherit" }) =>
      Effect.scoped(
        Effect.gen(function* () {
          const handle = yield* Effect.mapError(
            Effect.fromYieldable(
              ChildProcess.make(command, args, {
                cwd,
                stderr,
                stdin,
                stdout,
              })
            ),
            (cause: PlatformError.PlatformError) => mapCommandError(command, cause)
          )

          return yield* Effect.mapError(handle.exitCode, (cause: PlatformError.PlatformError) =>
            mapCommandError(command, cause)
          )
        })
      ),
  })
}
