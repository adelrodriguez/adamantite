import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { assessProject } from "#lib/assessment/index.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { readHardenContext, renderHardenPrompt } from "#lib/hardening/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { chooseResolution } from "#terminal/resolution-menu.ts"

const version = getPackageVersion()

export default Command.make("harden").pipe(
  Command.withDescription(
    "Ask a coding agent to turn the project's coding standards into custom rules and instructions"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      if (isInteractive) {
        yield* prompter.intro("💠 adamantite harden")
      }

      const packageJson = yield* readPackageJson(cwd)

      if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
        const message =
          "`adamantite` is not installed in this project. Install it before running `adamantite harden`."
        if (isInteractive) {
          yield* prompter.log.warning(message)
          yield* prompter.outro("⚠️ Harden did not start.")
        } else {
          yield* prompter.message(message)
        }
        return yield* new CommandFailed({
          command: "harden",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      const context = yield* readHardenContext(cwd)
      const prompt = renderHardenPrompt(context, version)

      if (!isInteractive) {
        yield* prompter.message(prompt)
        return
      }

      const resolution = yield* chooseResolution({
        command: "Harden",
        cwd,
        message: "How do you want to harden this project?",
        prompt,
        subject: "the prompt",
      })

      if (resolution._tag !== "Ended") {
        yield* prompter.outro("✅ Harden completed.")
        return
      }

      const { agent } = resolution
      const runner = yield* CommandRunner
      // The agent's exit code says nothing about the project, so `check` and the assessment decide.
      const checkPassed = yield* runner
        .runAll([
          { args: ["--check"], command: oxfmt.name, title: "✨ Checking formatting" },
          { args: [], command: oxlint.name, title: "🔍 Linting" },
        ])
        .pipe(
          Effect.as(true),
          Effect.catchTags({
            CliNotFound: (error) => prompter.log.error(error.message).pipe(Effect.as(false)),
            CommandFailed: () => Effect.succeed(false),
          })
        )
      const assessment = yield* assessProject(cwd)

      if (!checkPassed) {
        yield* prompter.log.error(`\`adamantite check\` failed after the ${agent.name} session.`)
      }

      if (assessment.findings.length > 0) {
        yield* prompter.log.warning(`Doctor found issues after the ${agent.name} session.`)
        yield* printFindings(assessment.findings)
      }

      if (!checkPassed || assessment.findings.length > 0) {
        yield* prompter.outro("⚠️ Harden verification failed.")
        return yield* new CommandFailed({
          command: "harden",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      yield* prompter.log.success(
        `\`adamantite check\` and Doctor pass after the ${agent.name} session.`
      )
      yield* prompter.outro("✅ Harden completed successfully!")
    }).pipe(
      Effect.catchTag("OperationCancelled", () =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.cancel("Harden was cancelled. Nothing was changed.")
          return yield* new CommandFailed({
            command: "harden",
            exitCode: ChildProcessSpawner.ExitCode(1),
          })
        })
      )
    )
  )
)
