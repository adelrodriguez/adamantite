import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"

const fix = Flag.Boolean("fix").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Automatically fix issues")
)

export default Command.make("monorepo", { fix }).pipe(
  Command.withDescription("Find and fix monorepo-specific issues using Sherif"),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const args = fix ? ["--fix", ...forwardedArguments] : [...forwardedArguments]
      yield* runner.runOrFail({
        args,
        command: sherif.name,
        stdin: "inherit",
      })
    })
  )
)
