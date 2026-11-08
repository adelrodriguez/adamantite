import process from "node:process"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import * as Toolchain from "#lib/toolchain/index.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Files to fix. Omit to fix the project"),
  Argument.variadic()
)

const suggested = Flag.Boolean("suggested").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply Oxlint's suggested fixes")
)

const dangerous = Flag.Boolean("dangerous").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply Oxlint's dangerous fixes")
)

const all = Flag.Boolean("all").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply all Oxlint fixes, including suggested and dangerous fixes")
)

const only = Flag.Literals("only", ["format", "lint"]).pipe(
  Flag.optional,
  Flag.withDescription("Run only format (Oxfmt) or lint (Oxlint). Pass tool arguments after --")
)

export default Command.make("fix", { all, dangerous, files, only, suggested }).pipe(
  Command.withDescription("Apply lint fixes and format code"),
  Command.withHandler(({ all, dangerous, files, only, suggested }) =>
    Effect.gen(function* () {
      yield* Toolchain.fix({
        all,
        cwd: process.cwd(),
        dangerous,
        files,
        forwardedArguments: yield* ForwardedArguments,
        only: Option.getOrUndefined(only),
        suggested,
      })
    })
  )
)
