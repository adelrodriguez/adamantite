import { Args, Command, Options } from "@effect/cli"
import { Command as ShellCommand } from "@effect/platform"
import { Effect, Option } from "effect"
import { CommandFailed } from "#errors.ts"
import { oxlint } from "#helpers/packages/oxlint.ts"

const files = Args.file({ exists: "yes" }).pipe(
  Args.withDescription("Specific files to fix (optional)"),
  Args.repeated,
  Args.optional
)

const suggested = Options.boolean("suggested").pipe(
  Options.withDescription("Apply suggested fixes")
)

const dangerous = Options.boolean("dangerous").pipe(
  Options.withDescription("Apply dangerous fixes")
)

const all = Options.boolean("all").pipe(
  Options.withDescription("Apply all fixes, including suggested and dangerous fixes")
)

export default Command.make("fix", { all, dangerous, files, suggested }).pipe(
  Command.withDescription("Fix issues in code using oxlint"),
  Command.withHandler(({ all, dangerous, files, suggested }) =>
    Effect.gen(function* () {
      const args = new Set<string>(["--type-aware", "--fix"])

      if (suggested || all) {
        args.add("--fix-suggestions")
      }

      if (dangerous || all) {
        args.add("--fix-dangerously")
      }

      if (Option.isSome(files)) {
        for (const file of files.value) {
          args.add(file)
        }
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
