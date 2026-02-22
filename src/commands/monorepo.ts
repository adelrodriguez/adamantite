import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as ShellCommand from "@effect/platform/Command"
import * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as Effect from "effect/Effect"
import { CommandFailed } from "#errors.ts"
import { sherif } from "#helpers/packages/sherif.ts"

const fix = Options.boolean("fix").pipe(Options.withDescription("Automatically fix issues"))

export default Command.make("monorepo", { fix }).pipe(
  Command.withDescription("Find and fix monorepo-specific issues using Sherif"),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const args: string[] = []

      if (fix) {
        args.push("--fix")
      }

      return yield* ShellCommand.make(sherif.name, ...args).pipe(
        ShellCommand.stdin("inherit"),
        ShellCommand.stdout("inherit"),
        ShellCommand.stderr("inherit"),
        ShellCommand.exitCode,
        Effect.filterOrFail(
          (exitCode) => exitCode === CommandExecutor.ExitCode(0),
          (exitCode) => new CommandFailed({ command: sherif.name, exitCode })
        ),
        Effect.asVoid
      )
    })
  )
)
