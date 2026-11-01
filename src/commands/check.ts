import process from "node:process"
import * as Argument from "effect/cli/Argument"
import * as Command from "effect/cli/Command"
import * as Flag from "effect/cli/Flag"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import { getOxlintCommand } from "#lib/execution/oxlint-entry.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"

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

// Agents copy the code that they read, so a warning that passes `check` spreads like code that
// has no report. `check` fails on warnings unless the user allows them.
const allowWarnings = Flag.Boolean("allow-warnings").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Pass the lint stage when Oxlint reports only warnings")
)

export default Command.make("check", { allowWarnings, files, only }).pipe(
  Command.withDescription("Check formatting, code issues, and type errors"),
  Command.withHandler(({ allowWarnings, files, only }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const oxlintCommand = getOxlintCommand(process.cwd())
      const selected = Option.getOrUndefined(only)
      const forwardedStage = selected ?? "lint"
      // A forwarded `--deny-warnings` or `--max-warnings` is the project's own warning policy, and
      // Oxlint rejects `--deny-warnings` twice.
      const forwardsWarningPolicy = forwardedArguments.some(
        (argument) => argument === "--deny-warnings" || argument.startsWith("--max-warnings")
      )
      const denyWarnings = allowWarnings || forwardsWarningPolicy ? [] : ["--deny-warnings"]

      const forwardedTo = (stage: typeof forwardedStage) =>
        stage === forwardedStage ? forwardedArguments : []

      const stages = {
        format: {
          args: ["--check", ...files, ...forwardedTo("format")],
          command: oxfmt.name,
          title: "✨ Checking formatting",
        },
        lint: {
          ...oxlintCommand,
          args: [...oxlintCommand.args, ...files, ...denyWarnings, ...forwardedTo("lint")],
          title: "🔍 Linting",
        },
      }

      yield* runner.runAll(
        selected === undefined ? [stages.format, stages.lint] : [stages[selected]]
      )
    })
  )
)
