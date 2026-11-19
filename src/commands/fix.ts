import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Bridge from "#lib/bridge/index.ts"
import * as Project from "#lib/project/index.ts"
import { readSelection } from "#lib/project/lockfile.ts"
import { ForwardedArguments } from "#lib/shared/forwarded-arguments.ts"

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

function toFixLevel(flags: {
  readonly all: boolean
  readonly dangerous: boolean
  readonly suggested: boolean
}): Bridge.FixLevel {
  if (flags.all || (flags.suggested && flags.dangerous)) {
    return "all"
  }

  if (flags.suggested) {
    return "suggested"
  }

  return flags.dangerous ? "dangerous" : "safe"
}

export default Command.make("fix", { all, dangerous, files, only, suggested }).pipe(
  Command.withDescription("Apply lint fixes and format code"),
  Command.withHandler(({ all, dangerous, files, only, suggested }) =>
    Effect.gen(function* () {
      yield* Bridge.fix({
        files,
        forwardedArguments: yield* ForwardedArguments,
        level: toFixLevel({ all, dangerous, suggested }),
        only: Option.getOrUndefined(only),
        selection: yield* readSelection(yield* Project.Directory),
      })
    })
  )
)
