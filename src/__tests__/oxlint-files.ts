import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as ChildProcess from "effect/process/ChildProcess"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import * as Sink from "effect/Sink"
import * as Stream from "effect/Stream"

/**
 * The linted files returned by Oxlint, without a host process.
 */
export function makeOxlintFilesLayer(files: readonly string[] = []) {
  return Layer.succeed(ChildProcessSpawner.ChildProcessSpawner)(
    ChildProcessSpawner.make((command) => {
      if (!ChildProcess.isStandardCommand(command) || !command.args.includes("--debug=files")) {
        return Effect.die("Tests must not spawn a process other than the Oxlint file list")
      }

      return Effect.succeed(
        ChildProcessSpawner.makeHandle({
          all: Stream.empty,
          exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
          getInputFd: () => Sink.drain,
          getOutputFd: () => Stream.empty,
          isRunning: Effect.succeed(false),
          kill: () => Effect.void,
          pid: ChildProcessSpawner.ProcessId(1),
          stderr: Stream.empty,
          stdin: Sink.drain,
          stdout: Stream.make(new TextEncoder().encode(files.join("\n"))),
          unref: Effect.succeed(Effect.void),
        })
      )
    })
  )
}
