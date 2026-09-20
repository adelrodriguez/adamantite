import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { InvalidFixOptions } from "#lib/shared/errors.ts"

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

const lint = Flag.Boolean("lint").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Fix only lint issues. Arguments after `--` go to Oxlint")
)

const format = Flag.Boolean("format").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Only format. Arguments after `--` go to Oxfmt")
)

export default Command.make("fix", { all, dangerous, files, format, lint, suggested }).pipe(
  Command.withDescription("Fix lint and formatting issues in code"),
  Command.withHandler(({ all, dangerous, files, format, lint, suggested }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const formatOnly = format && !lint
      const lintOnly = lint && !format

      if (formatOnly && (all || dangerous || suggested)) {
        return yield* new InvalidFixOptions({
          reason:
            "`--suggested`, `--dangerous`, and `--all` apply to lint fixes. Remove them or `--format`.",
        })
      }

      const targets = Array.dedupe(files)
      const args = Array.dedupe([
        "--fix",
        ...(suggested || all ? ["--fix-suggestions"] : []),
        ...(dangerous || all ? ["--fix-dangerously"] : []),
        ...targets,
      ])

      yield* runner.runAll([
        ...(formatOnly
          ? []
          : [
              {
                args: [...args, ...forwardedArguments],
                command: oxlint.name,
                title: "🔧 Fixing lint issues",
              },
            ]),
        ...(lintOnly
          ? []
          : [
              {
                args: ["--write", ...targets, ...(formatOnly ? forwardedArguments : [])],
                command: oxfmt.name,
                title: "✨ Formatting",
              },
            ]),
      ])
    })
  )
)
