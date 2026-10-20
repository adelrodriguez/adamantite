import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import { assessProject, renderAssessmentMarkdown } from "#lib/assessment/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { offerHandoff, offerPromptCopy } from "#terminal/handoff.ts"
import { Prompter } from "#terminal/prompter.ts"

const version = getPackageVersion()

export default Command.make("doctor").pipe(
  Command.withDescription("Assess Adamantite-managed integrations in the current project"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      if (isInteractive) {
        yield* prompter.intro("💠 adamantite doctor")
      }

      // Only reachable on the interactive path: the non-interactive branch fails earlier.
      const failWithFindings = Effect.gen(function* () {
        yield* prompter.outro("⚠️ Doctor found issues.")
        return yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      })

      const initialPackageJson = yield* readPackageJson(cwd)

      if (
        !initialPackageJson.devDependencies?.adamantite
        && !initialPackageJson.dependencies?.adamantite
      ) {
        const message =
          "`adamantite` is not installed in this project. Install it before running `adamantite doctor`."
        if (isInteractive) {
          yield* prompter.log.warning(message)
          yield* prompter.outro("⚠️ Doctor found issues.")
        } else {
          yield* prompter.message(message)
        }
        return yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      const assessment = yield* assessProject(cwd)

      if (isInteractive) {
        for (const warning of assessment.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      if (assessment.applicableIntegrations.length === 0) {
        if (isInteractive) {
          yield* prompter.log.success("No applicable integrations found.")
          yield* prompter.outro("✅ Doctor completed successfully!")
        }
        return
      }

      if (assessment.findings.length === 0) {
        if (isInteractive) {
          yield* prompter.log.success("No issues found.")
          yield* prompter.outro("✅ Doctor completed successfully!")
        } else if (assessment.warnings.length > 0) {
          yield* prompter.message(renderAssessmentMarkdown(assessment, version))
        }
        return
      }

      if (!isInteractive) {
        yield* prompter.message(renderAssessmentMarkdown(assessment, version))
        return yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      yield* printFindings(assessment.findings)

      const handoff = yield* offerHandoff({
        command: "Doctor",
        cwd,
        message: "How do you want to resolve these findings?",
        prompt: renderAssessmentMarkdown(assessment, version),
        subject: "findings",
      })

      if (handoff._tag !== "Ended") {
        return yield* failWithFindings
      }

      const { agent } = handoff
      const after = yield* assessProject(cwd)

      if (after.findings.length === 0) {
        yield* prompter.log.success(`All findings were resolved by ${agent.name}.`)
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      yield* prompter.log.warning(
        `${after.findings.length} of ${assessment.findings.length} findings remain after the ${agent.name} session.`
      )
      yield* printFindings(after.findings)
      yield* offerPromptCopy(renderAssessmentMarkdown(after, version))
      return yield* failWithFindings
    }).pipe(
      Effect.catchTag("OperationCancelled", () =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.cancel("Doctor was cancelled. The findings remain.")
          return yield* new CommandFailed({
            command: "doctor",
            exitCode: ChildProcessSpawner.ExitCode(1),
          })
        })
      )
    )
  )
)
