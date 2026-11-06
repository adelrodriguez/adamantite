import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import * as Toolchain from "#lib/toolchain/index.ts"

const fix = Flag.Boolean("fix").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Automatically fix issues in every stage that runs")
)

const strict = Flag.Boolean("strict").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Enable strict mode for the unused stage (knip)")
)

const only = Flag.Literals("only", ["monorepo", "unused"]).pipe(
  Flag.optional,
  Flag.withDescription(
    "Run one stage: `monorepo` (sherif, monorepos only) or `unused` (knip). Arguments after `--` go to that stage"
  )
)

export default Command.make("analyze", { fix, only, strict }).pipe(
  Command.withDescription(
    "Find monorepo issues using sherif, then unused dependencies, exports, and files using knip"
  ),
  Command.withExamples([
    {
      command: "adamantite analyze -- --directory packages/app",
      description: "Run knip from a specific directory",
    },
    {
      command: "adamantite analyze --only monorepo --fix -- --select highest",
      description: "Fix only the monorepo issues and use the highest version on a mismatch",
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
