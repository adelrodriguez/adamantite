import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandFailed } from "#errors.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { CommandRunner } from "#services/command-runner.ts"

const fix = Flag.boolean("fix").pipe(Flag.withDescription("Automatically fix issues"))

export default Command.make("monorepo", { fix }).pipe(
  Command.withDescription("Find and fix monorepo-specific issues using Sherif"),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner
      const args = fix ? ["--fix"] : []
      const exitCode = yield* runner.run({
        args,
        command: sherif.name,
        stdin: "inherit",
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* Effect.fail(new CommandFailed({ command: sherif.name, exitCode }))
      }
    })
  )
)
