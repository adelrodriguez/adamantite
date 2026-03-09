import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandFailed } from "#errors.ts"
import { knip } from "#helpers/packages/knip.ts"
import { CommandRunner } from "#services/command-runner.ts"

const fix = Flag.boolean("fix").pipe(Flag.withDescription("Automatically fix issues"))

const strict = Flag.boolean("strict").pipe(Flag.withDescription("Enable strict mode"))

export default Command.make("analyze", { fix, strict }).pipe(
  Command.withDescription("Find unused dependencies, exports, and files using knip"),
  Command.withHandler(({ fix, strict }) =>
    Effect.gen(function* () {
      const runner = yield* CommandRunner
      const args: string[] = []

      if (fix) {
        args.push("--fix", "--allow-remove-files")
      }

      if (strict) {
        args.push("--production", "--strict")
      }

      const exitCode = yield* runner.run({
        args,
        command: knip.name,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* Effect.fail(new CommandFailed({ command: knip.name, exitCode }))
      }
    })
  )
)
