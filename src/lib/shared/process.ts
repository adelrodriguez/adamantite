import process from "node:process"
import * as Effect from "effect/Effect"
import * as ChildProcess from "effect/unstable/process/ChildProcess"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CliNotFound } from "#lib/shared/errors.ts"

export const checkCliExists = (command: string) => {
  const executable = process.platform === "win32" ? "where" : "which"

  return Effect.scoped(
    Effect.gen(function* () {
      const handle = yield* ChildProcess.make(executable, [command], {
        stderr: "ignore",
        stdin: "ignore",
        stdout: "ignore",
      })
      return yield* handle.exitCode
    })
  ).pipe(
    Effect.flatMap((exitCode) =>
      exitCode === ChildProcessSpawner.ExitCode(0)
        ? Effect.succeed(true)
        : Effect.fail(new CliNotFound({ command }))
    )
  )
}
