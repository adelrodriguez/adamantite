import process from "node:process"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import * as Toolchain from "#lib/toolchain/index.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Files to check. Omit to check the project"),
  Argument.variadic()
)

const only = Flag.Literals("only", ["format", "lint"]).pipe(
  Flag.optional,
  Flag.withDescription("Run only format (Oxfmt) or lint (Oxlint). Pass tool arguments after --")
)

// Agents copy the code that they read, so a warning that passes `check` spreads like code that
// has no report. `check` fails on warnings unless the user allows them.
const allowWarnings = Flag.Boolean("allow-warnings").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Allow the lint check to pass when Oxlint reports only warnings")
)

export default Command.make("check", { allowWarnings, files, only }).pipe(
  Command.withDescription("Check formatting, lint issues, and TypeScript types"),
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
