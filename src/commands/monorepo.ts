import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { sherif } from "#lib/integrations/tooling/sherif.ts"
import { CommandRunner } from "#lib/services/command-runner.ts"
import { CommandFailed } from "#lib/shared/errors.ts"

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
        yield* new CommandFailed({ command: sherif.name, exitCode })
      }
    })
  )
)
