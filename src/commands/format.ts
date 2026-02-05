import { Args, Command, Options } from "@effect/cli"
import { Command as ShellCommand } from "@effect/platform"
import { Effect, Option } from "effect"
import { CommandFailed } from "#errors.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"

const files = Args.file({ exists: "yes" }).pipe(
  Args.withDescription("Specific files to format (optional)"),
  Args.repeated,
  Args.optional
)

const check = Options.boolean("check").pipe(
  Options.withDescription("Check if files are formatted without writing")
)

export default Command.make("format", { check, files }).pipe(
  Command.withDescription("Format files using oxfmt"),
  Command.withHandler(({ check, files }) =>
    Effect.gen(function* () {
      const args: string[] = []

      if (check) {
        args.push("--check")
      }

      if (Option.isSome(files)) {
        args.push(...files.value)
      }

      return yield* ShellCommand.make(oxfmt.name, ...args).pipe(
        ShellCommand.stdout("inherit"),
        ShellCommand.stderr("inherit"),
        ShellCommand.exitCode,
        Effect.filterOrFail(
          (exitCode) => exitCode === 0,
          (exitCode) => new CommandFailed({ command: oxfmt.name, exitCode })
        ),
        Effect.asVoid
      )
    })
  )
)
