import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import { CommandFailed } from "#lib/shared/errors.ts"

const fix = Flag.boolean("fix").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Automatically fix issues")
)

const strict = Flag.boolean("strict").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Enable strict mode")
)

export default Command.make("analyze", { fix, strict }).pipe(
  Command.withDescription("Find unused dependencies, exports, and files using knip"),
  Command.withExamples([
    {
      command: "adamantite analyze -- --directory packages/app",
      description: "Run knip from a specific directory",
    },
  ]),
  Command.withHandler(({ fix, strict }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const args: string[] = []

      if (fix) {
        args.push("--fix", "--allow-remove-files")
      }

      if (strict) {
        args.push("--production", "--strict")
      }

      args.push(...forwardedArguments)

      const exitCode = yield* runner.run({
        args,
        command: knip.name,
      })

      if (exitCode !== ChildProcessSpawner.ExitCode(0)) {
        yield* new CommandFailed({ command: knip.name, exitCode })
      }
    })
  )
)
