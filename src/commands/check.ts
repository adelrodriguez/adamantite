import { Args, Command } from "@effect/cli"
import { Command as ShellCommand } from "@effect/platform"
import { Effect, Option } from "effect"
import { CommandFailed } from "#errors.ts"
import { oxlint } from "#helpers/packages/oxlint.ts"

const files = Args.file({ exists: "yes" }).pipe(
  Args.withDescription("Specific files to lint (optional)"),
  Args.repeated,
  Args.optional
)

export default Command.make("check", { files }).pipe(
  Command.withDescription("Find issues in code using oxlint"),
  Command.withHandler(({ files }) =>
    Effect.gen(function* () {
      const args: string[] = ["--type-aware"]

      if (Option.isSome(files)) {
        args.push(...files.value)
      }

      return yield* ShellCommand.make(oxlint.name, ...args).pipe(
        ShellCommand.stdout("inherit"),
        ShellCommand.stderr("inherit"),
        ShellCommand.exitCode,
        Effect.filterOrFail(
          (exitCode) => exitCode === 0,
          (exitCode) => new CommandFailed({ command: oxlint.name, exitCode })
        ),
        Effect.asVoid
      )
    })
  )
)
