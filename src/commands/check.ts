import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import * as Bridge from "#lib/bridge/index.ts"
import * as Project from "#lib/project/index.ts"
import { readLockfile, verifyLockfileVersion } from "#lib/project/lockfile.ts"
import { ForwardedArguments } from "#lib/shared/forwarded-arguments.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Files to check. Omit to check the project"),
  Argument.variadic()
)

const only = Flag.Literals("only", ["format", "lint"]).pipe(
  Flag.optional,
  Flag.withDescription("Run only format (Oxfmt) or lint (Oxlint). Pass tool arguments after --")
)

const allowWarnings = Flag.Boolean("allow-warnings").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Allow the lint check to pass when Oxlint reports only warnings")
)

export default Command.make("check", { allowWarnings, files, only }).pipe(
  Command.withDescription("Check formatting, lint issues, and TypeScript types"),
  Command.withHandler(({ allowWarnings, files, only }) =>
    Effect.gen(function* () {
      const root = yield* Project.Directory

      const lockfile = yield* readLockfile(root).pipe(
        Effect.catchTag(["InvalidLockfile", "UnsupportedLockfile"], () => Effect.succeedNone)
      )

      const stages = yield* Bridge.check({
        allowWarnings,
        files,
        forwardedArguments: yield* ForwardedArguments,
        only: Option.getOrUndefined(only),
        selection: Option.map(lockfile, ({ selection }) => selection),
      }).pipe(Effect.exit)

      const setup = yield* verifyLockfileVersion(root, lockfile).pipe(Effect.exit)

      return yield* Exit.asVoidAll([stages, setup])
    })
  )
)
