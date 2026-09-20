import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"

const files = Argument.File("files", { mustExist: true }).pipe(
  Argument.withDescription("Specific files to check (optional)"),
  Argument.variadic()
)

const lint = Flag.Boolean("lint").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Check only lint and type errors. Arguments after `--` go to Oxlint")
)

const format = Flag.Boolean("format").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Check only formatting. Arguments after `--` go to Oxfmt")
)

export default Command.make("check", { files, format, lint }).pipe(
  Command.withDescription("Check formatting, code issues, and type errors"),
  Command.withHandler(({ files, format, lint }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const formatOnly = format && !lint
      const lintOnly = lint && !format

      yield* runner.runAll([
        ...(lintOnly
          ? []
          : [
              {
                args: ["--check", ...files, ...(formatOnly ? forwardedArguments : [])],
                command: oxfmt.name,
                title: "✨ Checking formatting",
              },
            ]),
        ...(formatOnly
          ? []
          : [
              {
                args: [...files, ...forwardedArguments],
                command: oxlint.name,
                title: "🔍 Linting",
              },
            ]),
      ])
    })
  )
)
