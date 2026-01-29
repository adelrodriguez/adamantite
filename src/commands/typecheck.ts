import { Command, Options } from "@effect/cli"
import { Command as ShellCommand } from "@effect/platform"
import { Effect, Option } from "effect"
import { typescript } from "#helpers/packages/typescript.ts"
import { Cwd } from "#services/cwd.ts"

const project = Options.file("project").pipe(
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
      const cwd = yield* Cwd
      const currentDir = yield* cwd.get

      const args = ["--noEmit"]

      if (Option.isSome(project)) {
        args.push("--project", project.value)
      }

      if (watch) {
        args.push("--watch")
      }

      return yield* ShellCommand.make(typescript.command, ...args).pipe(
        ShellCommand.workingDirectory(currentDir),
        ShellCommand.stdout("inherit"),
        ShellCommand.stderr("inherit"),
        ShellCommand.exitCode
      )
    })
  )
)
