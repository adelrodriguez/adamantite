import { Command, Options } from "@effect/cli"
import { Command as ShellCommand } from "@effect/platform"
import { Effect, Option } from "effect"
import { typescript } from "#helpers/packages/typescript.ts"
import { PackageManager } from "#services/package-manager.ts"

const project = Options.text("project").pipe(
  Options.withAlias("p"),
  Options.optional,
  Options.withDescription("Path to tsconfig.json file")
)

const watch = Options.boolean("watch").pipe(
  Options.withAlias("w"),
  Options.withDescription("Run in watch mode")
)

export default Command.make("typecheck", { project, watch }).pipe(
  Command.withDescription("Run TypeScript type checking"),
  Command.withHandler(({ project, watch }) =>
    Effect.gen(function* () {
      const pm = yield* PackageManager
      const [command, ...commandArgs] = pm.command

      const args = ["--noEmit"]

      if (Option.isSome(project)) {
        args.push("--project", project.value)
      }

      if (watch) {
        args.push("--watch")
      }

      return yield* ShellCommand.make(command, ...commandArgs, typescript.command, ...args).pipe(
        ShellCommand.stdout("inherit"),
        ShellCommand.stderr("inherit"),
        ShellCommand.exitCode
      )
    })
  )
)
