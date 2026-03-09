import process from "node:process"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandFailed } from "#errors.ts"
import { typescript } from "#helpers/packages/typescript.ts"
import { CommandRunner } from "#services/command-runner.ts"

const project = Flag.file("project", { mustExist: true }).pipe(
  Flag.withAlias("p"),
  Flag.optional,
  Flag.withDescription("Path to tsconfig.json file")
)

const watch = Flag.boolean("watch").pipe(
  Flag.withAlias("w"),
  Flag.withDescription("Run in watch mode")
)

export default Command.make("typecheck", { project, watch }).pipe(
  Command.withDescription("Run TypeScript type checking"),
  Command.withHandler(({ project, watch }) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner
      const cwd = process.cwd()
      const args = ["--noEmit"]

      if (Option.isSome(project)) {
        args.push("--project", project.value)
      }

      if (watch) {
        args.push("--watch")
      }

      const exitCode = yield* runner.run({
        args,
        command: typescript.command,
        cwd,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* Effect.fail(new CommandFailed({ command: typescript.command, exitCode }))
      }
    })
  )
)
