import * as Console from "effect/Console"
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

function getDeprecationWarning(isFix: boolean, forwardedArguments: readonly string[]) {
  const replacement = [
    "adamantite analyze --only monorepo",
    ...(isFix ? ["--fix"] : []),
    ...(forwardedArguments.length > 0 ? ["--", ...forwardedArguments] : []),
  ].join(" ")

  return (
    "Warning: `adamantite monorepo` is deprecated and will be removed in the next release. "
    + `Use \`${replacement}\` instead.`
  )
}

export default Command.make("monorepo", { fix }).pipe(
  Command.withDescription(
    "Deprecated: use `analyze`. Find and fix monorepo-specific issues using Sherif"
  ),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner

      yield* Console.error(getDeprecationWarning(fix, forwardedArguments))

      const args = fix ? ["--fix", ...forwardedArguments] : [...forwardedArguments]
      yield* runner.run({
        args,
        command: sherif.name,
        stdin: "inherit",
      })
    })
  )
)
