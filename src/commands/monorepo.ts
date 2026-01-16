import { Command, Options } from "@effect/cli"
import { Command as ShellCommand } from "@effect/platform"
import { Effect } from "effect"
import { sherif } from "#helpers/packages/sherif.ts"
import { PackageManager } from "#services/package-manager.ts"

const fix = Options.boolean("fix").pipe(Options.withDescription("Automatically fix issues"))

export default Command.make("monorepo", { fix }).pipe(
  Command.withDescription("Find and fix monorepo-specific issues using Sherif"),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const pm = yield* PackageManager
      const [command, ...commandArgs] = pm.command

      const args: string[] = []

      if (fix) {
        args.push("--fix")
      }

      return yield* ShellCommand.make(command, ...commandArgs, sherif.name, ...args).pipe(
        ShellCommand.stdin("inherit"),
        ShellCommand.stdout("inherit"),
        ShellCommand.stderr("inherit"),
        ShellCommand.exitCode
      )
    })
  )
)
