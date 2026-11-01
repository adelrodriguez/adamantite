import * as Array from "effect/Array"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import { OXLINT_COMMAND } from "#lib/execution/oxlint-entry.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
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

const only = Flag.Literals("only", ["format", "lint"]).pipe(
  Flag.optional,
  Flag.withDescription(
    "Run one stage: `format` (oxfmt) or `lint` (oxlint). Arguments after `--` go to that stage"
  )
)

export default Command.make("fix", { all, dangerous, files, only, suggested }).pipe(
  Command.withDescription("Fix lint and formatting issues in code"),
  Command.withHandler(({ all, dangerous, files, only, suggested }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const selected = Option.getOrUndefined(only)

      if (selected === "format" && (all || dangerous || suggested)) {
        return yield* new InvalidFixOptions({
          reason:
            "`--suggested`, `--dangerous`, and `--all` apply to the lint stage. Remove them or `--only format`.",
        })
      }

      const targets = Array.dedupe(files)
      const forwardedStage = selected ?? "lint"

      const forwardedTo = (stage: typeof forwardedStage) =>
        stage === forwardedStage ? forwardedArguments : []

      const stages = {
        format: {
          args: ["--write", ...targets, ...forwardedTo("format")],
          command: oxfmt.name,
          title: "✨ Formatting",
        },
        lint: {
          ...OXLINT_COMMAND,
          args: [
            ...OXLINT_COMMAND.args,
            ...Array.dedupe([
              "--fix",
              ...(suggested || all ? ["--fix-suggestions"] : []),
              ...(dangerous || all ? ["--fix-dangerously"] : []),
              ...targets,
            ]),
            ...forwardedTo("lint"),
          ],
          title: "🔧 Fixing lint issues",
        },
      }

      yield* runner.runAll(
        selected === undefined ? [stages.lint, stages.format] : [stages[selected]]
      )
    })
  )
)
