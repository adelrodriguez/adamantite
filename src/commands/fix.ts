import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to fix (optional)"),
  Argument.variadic()
)

const suggested = Flag.Boolean("suggested").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply suggested fixes")
)

const dangerous = Flag.Boolean("dangerous").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply dangerous fixes")
)

const all = Flag.Boolean("all").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Apply all fixes, including suggested and dangerous fixes")
)

export default Command.make("fix", { all, dangerous, files, suggested }).pipe(
  Command.withDescription("Fix lint and formatting issues in code"),
  Command.withHandler(({ all, dangerous, files, suggested }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const targets = Array.dedupe(files)
      const args = Array.dedupe([
        "--fix",
        ...(suggested || all ? ["--fix-suggestions"] : []),
        ...(dangerous || all ? ["--fix-dangerously"] : []),
        ...targets,
      ])

      yield* runner.runAll([
        {
          args: [...args, ...forwardedArguments],
          command: oxlint.name,
          title: "🔧 Fixing lint issues",
        },
        { args: ["--write", ...targets], command: oxfmt.name, title: "✨ Formatting" },
      ])
    })
  )
)
