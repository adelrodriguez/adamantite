import process from "node:process"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import * as Toolchain from "#lib/toolchain/index.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to check (optional)"),
  Argument.variadic()
)

const only = Flag.Literals("only", ["format", "lint"]).pipe(
  Flag.optional,
  Flag.withDescription(
    "Run one stage: `format` (oxfmt) or `lint` (oxlint). Arguments after `--` go to that stage"
  )
)

// Agents copy the code that they read, so a warning that passes `check` spreads like code that
// has no report. `check` fails on warnings unless the user allows them.
const allowWarnings = Flag.Boolean("allow-warnings").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Pass the lint stage when Oxlint reports only warnings")
)

export default Command.make("check", { allowWarnings, files, only }).pipe(
  Command.withDescription("Check formatting, code issues, and type errors"),
  Command.withHandler(({ allowWarnings, files, only }) =>
    Effect.gen(function* () {
      yield* Toolchain.check({
        allowWarnings,
        cwd: process.cwd(),
        files,
        forwardedArguments: yield* ForwardedArguments,
        only: Option.getOrUndefined(only),
      })
    })
  )
)
