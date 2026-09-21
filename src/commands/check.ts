import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"

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

export default Command.make("check", { files, only }).pipe(
  Command.withDescription("Check formatting, code issues, and type errors"),
  Command.withHandler(({ files, only }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const selected = Option.getOrUndefined(only)
      const forwardedStage = selected ?? "lint"

      const stages = [
        {
          args: ["--check", ...files],
          command: oxfmt.name,
          name: "format",
          title: "✨ Checking formatting",
        },
        { args: [...files], command: oxlint.name, name: "lint", title: "🔍 Linting" },
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
