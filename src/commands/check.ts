import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandFailed } from "#errors.ts"
import { oxlint } from "#helpers/packages/oxlint.ts"
import { CommandRunner } from "#services/command-runner.ts"

const files = Argument.file("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to lint (optional)"),
  Argument.variadic()
)

export default Command.make("check", { files }).pipe(
  Command.withDescription("Find issues in code using oxlint"),
  Command.withHandler(({ files }) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner
      const exitCode = yield* runner.run({
        args: ["--type-aware", ...files],
        command: oxlint.name,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* new CommandFailed({ command: oxlint.name, exitCode })
      }
    })
  )
)
