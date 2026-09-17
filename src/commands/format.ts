import * as Console from "effect/Console"
import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to format (optional)"),
  Argument.variadic()
)

const check = Flag.Boolean("check").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Check if files are formatted without writing")
)

const deprecationWarning =
  "Warning: `adamantite format` is deprecated and will be removed in the next release. "
  + "Use `adamantite fix` to apply formatting and `adamantite check` to verify it."

export default Command.make("format", { check, files }).pipe(
  Command.withDescription("Deprecated: use `fix` or `check`. Format files using oxfmt"),
  Command.withHandler(({ check, files }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const args: string[] = []

      yield* Console.error(deprecationWarning)

      if (check) {
        args.push("--check")
      }

      args.push(...files, ...forwardedArguments)

      yield* runner.run({
        args,
        command: oxfmt.name,
      })
    })
  )
)
