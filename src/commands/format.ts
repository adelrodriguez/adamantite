import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandFailed } from "#errors.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { CommandRunner } from "#services/command-runner.ts"

const files = Argument.file("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to format (optional)"),
  Argument.variadic()
)

const check = Flag.boolean("check").pipe(
  Flag.withDescription("Check if files are formatted without writing")
)

export default Command.make("format", { check, files }).pipe(
  Command.withDescription("Format files using oxfmt"),
  Command.withHandler(({ check, files }) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner
      const args: string[] = []

      if (check) {
        args.push("--check")
      }

      args.push(...files)

      const exitCode = yield* runner.run({
        args,
        command: oxfmt.name,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* Effect.fail(new CommandFailed({ command: oxfmt.name, exitCode }))
      }
    })
  )
)
