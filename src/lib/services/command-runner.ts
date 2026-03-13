import type * as PlatformError from "effect/PlatformError"
import type * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ServiceMap from "effect/ServiceMap"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import { CliNotFound } from "#lib/shared/errors.ts"

export interface CommandRunOptions {
  readonly args: string[]
  readonly command: string
  readonly cwd?: string
  readonly stderr?: "ignore" | "inherit"
  readonly stdin?: "ignore" | "inherit"
  readonly stdout?: "ignore" | "inherit"
}

export type CommandFailedLike = CliNotFound | PlatformError.PlatformError

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
      Effect.mapError(
        Effect.scoped(
          Effect.gen(function* () {
            const handle = yield* Effect.fromYieldable(
              ChildProcess.make(command, args, {
                cwd,
                stderr,
                stdin,
                stdout,
              })
            )

            return yield* handle.exitCode
          })
        ),
        (cause) => (cause.reason._tag === "NotFound" ? new CliNotFound({ command }) : cause)
      ),
  })
}
