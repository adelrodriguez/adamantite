import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as ShellCommand from "@effect/platform/Command"
import * as CommandExecutor from "@effect/platform/CommandExecutor"
import { Effect } from "effect"
import { CommandFailed } from "#errors.ts"
import { knip } from "#helpers/packages/knip.ts"

const fix = Options.boolean("fix").pipe(Options.withDescription("Automatically fix issues"))

const strict = Options.boolean("strict").pipe(Options.withDescription("Enable strict mode"))

export default Command.make("analyze", { fix, strict }).pipe(
  Command.withDescription("Find unused dependencies, exports, and files using knip"),
  Command.withHandler(({ fix, strict }) =>
    Effect.gen(function* () {
      const args: string[] = []

      if (fix) {
        args.push("--fix", "--allow-remove-files")
      }

      if (strict) {
        args.push("--production", "--strict")
      }

      return yield* ShellCommand.make(knip.name, ...args).pipe(
        ShellCommand.stdout("inherit"),
        ShellCommand.stderr("inherit"),
        ShellCommand.exitCode,
        Effect.filterOrFail(
          (exitCode) => exitCode === CommandExecutor.ExitCode(0),
          (exitCode) => new CommandFailed({ command: knip.name, exitCode })
        ),
        Effect.asVoid
      )
    })
  )
)
