import process from "node:process"
import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import {
  type CodingAgent,
  checkWorkingTreeState,
  codingAgents,
  detectInstalledAgents,
  runAgentSession,
} from "#lib/execution/coding-agents.ts"
import { assessProject, renderAssessmentMarkdown } from "#lib/integrations/assessment.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const fix = Flag.boolean("fix").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Removed. Run doctor and follow its findings")
)

const version = getPackageVersion()

type ResolveAction = CodingAgent | "copy" | "done"

export default Command.make("doctor", { fix }).pipe(
  Command.withDescription("Assess Adamantite-managed integrations in the current project"),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      if (isInteractive) {
        yield* printTitle()
        yield* prompter.intro("💠 adamantite doctor")
      }

      const failWithFindings = Effect.gen(function* () {
        if (isInteractive) {
          yield* prompter.outro("⚠️ Doctor found issues.")
        }
        return yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      })

      if (fix) {
        const message =
          "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria."
        if (isInteractive) {
          yield* prompter.log.error(message)
          yield* prompter.outro("❌ Doctor did not run")
        } else {
          yield* prompter.message(message)
        }
        return yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      const initialPackageJson = yield* readPackageJson(cwd)

      if (
        !initialPackageJson.devDependencies?.adamantite &&
        !initialPackageJson.dependencies?.adamantite
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

      const offerPromptCopy = (promptText: string) =>
        Effect.gen(function* () {
          const shouldCopyPrompt = yield* prompter.confirm({
            initialValue: true,
            message: "Copy the Markdown prompt for a coding agent?",
          })

          if (shouldCopyPrompt) {
            yield* prompter.message(promptText)
            yield* terminal.copyToClipboard(promptText)
            yield* prompter.log.success(
              "The Markdown prompt was printed and sent to the terminal clipboard."
            )
          }
        })

      yield* printFindings(assessment.findings)

      const installedAgents = yield* prompter.withSpinner(() => detectInstalledAgents(cwd), {
        start: "Checking for installed coding agents...",
        success: (agents) =>
          agents.length === 0
            ? "No supported coding agent CLI was found on PATH."
            : `Found ${agents.map((agent) => agent.name).join(", ")}.`,
      })

      if (installedAgents.length === 0) {
        yield* prompter.log.info(
          `Doctor can hand findings off when one of these CLIs is installed: ${codingAgents
            .map((agent) => `\`${agent.command}\``)
            .join(", ")}.`
        )
      }

      const prompt = renderAssessmentMarkdown(assessment, version)
      const action = yield* prompter.select<ResolveAction>({
        message: "How do you want to resolve these findings?",
        options: [
          ...installedAgents.map((agent) => ({
            label: `Hand off to ${agent.name}`,
            value: agent,
          })),
          { label: "Copy the Markdown prompt for a coding agent", value: "copy" as const },
          { label: "Do nothing", value: "done" as const },
        ],
      })

      if (action === "done") {
        return yield* failWithFindings
      }

      if (action === "copy") {
        yield* offerPromptCopy(prompt)
        return yield* failWithFindings
      }

      const agent = action
      const treeState = yield* checkWorkingTreeState(cwd)

      if (treeState !== "clean") {
        yield* prompter.log.warning(
          treeState === "dirty"
            ? "The Git working tree has uncommitted changes. The agent will edit files on top of them."
            : "Doctor could not confirm a clean Git working tree. The agent will edit files without a checkpoint to return to."
        )
        const proceed = yield* prompter.confirm({
          initialValue: false,
          message: `Hand off to ${agent.name} anyway?`,
        })

        if (!proceed) {
          yield* offerPromptCopy(prompt)
          return yield* failWithFindings
        }
      }

      yield* prompter.log.info(
        `Handing the terminal to ${agent.name}. Exit the agent to return to Doctor.`
      )

      const started = yield* runAgentSession({ agent, cwd }).pipe(
        Effect.as(true),
        Effect.catchTag("AgentSessionFailed", (error) =>
          prompter.log
            .error(
              error.reason === "not-found"
                ? `\`${agent.command}\` was not found on PATH. Install ${agent.name} or copy the prompt instead.`
                : `Failed to start ${agent.name}.`
            )
            .pipe(Effect.as(false))
        )
      )

      if (!started) {
        yield* offerPromptCopy(prompt)
        return yield* failWithFindings
      }

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
