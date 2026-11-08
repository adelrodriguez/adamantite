import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import * as Toolchain from "#lib/toolchain/index.ts"

const fix = Flag.Boolean("fix").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply fixes in each selected stage")
)

const strict = Flag.Boolean("strict").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Enable Knip's strict mode when checking unused code")
)

const only = Flag.Literals("only", ["monorepo", "unused"]).pipe(
  Flag.optional,
  Flag.withDescription("Run only monorepo (Sherif) or unused (Knip). Pass tool arguments after --")
)

export default Command.make("analyze", { fix, only, strict }).pipe(
  Command.withDescription("Check monorepo consistency with Sherif and find unused code with Knip"),
  Command.withExamples([
    {
      command: "adamantite analyze -- --directory packages/app",
      description: "Run Knip from a specific directory",
    },
    {
      command: "adamantite analyze --only monorepo --fix -- --select highest",
      description: "Fix monorepo issues and use the highest version when versions differ",
    },
  ]),
  Command.withHandler(({ fix, only, strict }) =>
    Effect.gen(function* () {
      yield* Toolchain.analyze({
        cwd: process.cwd(),
        fix,
        forwardedArguments: yield* ForwardedArguments,
        only: Option.getOrUndefined(only),
        strict,
      })
    })
  )
)
