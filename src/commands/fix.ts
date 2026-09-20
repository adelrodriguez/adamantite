import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
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

      const stages = [
        {
          args: Array.dedupe([
            "--fix",
            ...(suggested || all ? ["--fix-suggestions"] : []),
            ...(dangerous || all ? ["--fix-dangerously"] : []),
            ...targets,
          ]),
          command: oxlint.name,
          name: "lint",
          title: "🔧 Fixing lint issues",
        },
        {
          args: ["--write", ...targets],
          command: oxfmt.name,
          name: "format",
          title: "✨ Formatting",
        },
      ]

      yield* runner.runAll(
        stages
          .filter((stage) => selected === undefined || stage.name === selected)
          .map((stage) => ({
            args: [...stage.args, ...(stage.name === forwardedStage ? forwardedArguments : [])],
            command: stage.command,
            title: stage.title,
          }))
      )
    })
  )
)
