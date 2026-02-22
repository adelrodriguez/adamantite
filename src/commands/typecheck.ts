import * as Command from "@effect/cli/Command"
import * as Options from "@effect/cli/Options"
import * as ShellCommand from "@effect/platform/Command"
import * as CommandExecutor from "@effect/platform/CommandExecutor"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { CommandFailed } from "#errors.ts"
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
        ShellCommand.exitCode,
        Effect.filterOrFail(
          (exitCode) => exitCode === CommandExecutor.ExitCode(0),
          (exitCode) => new CommandFailed({ command: typescript.command, exitCode })
        ),
        Effect.asVoid
      )
    })
  )
)
