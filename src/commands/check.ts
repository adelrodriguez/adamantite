import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { CommandFailed } from "#lib/shared/errors.ts"

const files = Argument.file("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to lint (optional)"),
  Argument.variadic()
)

export default Command.make("check", { files }).pipe(
  Command.withDescription("Find issues and type errors in code using oxlint"),
  Command.withHandler(({ files }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const exitCode = yield* runner.run({
        args: [...files, ...forwardedArguments],
        command: oxlint.name,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* new CommandFailed({ command: oxlint.name, exitCode })
      }
    })
  )
)
