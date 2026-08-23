import process from "node:process"
import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import github from "#lib/integrations/ci/github.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { collectApplicableAssessments } from "#lib/shared/assessment.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { collectFindings, renderFindingsPrompt } from "#lib/shared/findings.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { type AgentHarness, AgentRunner } from "#lib/workspace/agent-runner.ts"
import { GitStatus } from "#lib/workspace/git-status.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const fix = Flag.boolean("fix").pipe(
  Flag.withDescription("Removed. Run doctor and follow its findings")
)

const integrations = [knip, oxfmt, oxlint, sherif, tsgolint, tsconfig, github, zed] as const
const version = getPackageVersion()

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

      if (fix) {
        yield* prompter.log.error(
          "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria."
        )
        yield* prompter.outro("❌ Doctor did not run")
        return yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      const packageJson = yield* readPackageJson(cwd)

      if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
        yield* prompter.log.warning(
          "`adamantite` is not installed in this project. Install it before running `adamantite doctor`."
        )
        yield* prompter.outro("⚠️ Doctor found issues.")
        return yield* new CommandFailed({
          command: "doctor",
          exitCode: ChildProcessSpawner.ExitCode(1),
        })
      }

      const collectCurrentAssessments = () =>
        readPackageJson(cwd).pipe(
          Effect.flatMap((manifest) => collectApplicableAssessments(integrations, cwd, manifest))
        )
      const assessments = yield* collectApplicableAssessments(integrations, cwd, packageJson)

      for (const { assessment } of assessments) {
        for (const warning of assessment.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      const findings = collectFindings(assessments)

      if (assessments.length === 0) {
        yield* prompter.log.success("No applicable integrations found.")
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      if (findings.length === 0) {
        yield* prompter.log.success("No issues found.")
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      const prompt = renderFindingsPrompt(findings, version)

      if (isInteractive) {
        yield* printFindings(findings)
        const action = yield* prompter.select<"agent" | "prompt">({
          message: "What would you like to do?",
          options: [
            { label: "Pass to a coding agent", value: "agent" },
            { label: "Copy the Markdown prompt", value: "prompt" },
          ],
        })

        if (action === "prompt") {
          yield* terminal.copyToClipboard(prompt)
          yield* prompter.log.success("The Markdown prompt was copied to the terminal clipboard.")
        } else {
          const agentRunner = yield* AgentRunner
          const availableHarnesses = yield* agentRunner.detect()

          if (availableHarnesses.length === 0) {
            yield* prompter.log.warning(
              "No supported coding agent was found. Install Codex or Claude Code, or copy the Markdown prompt."
            )
          } else {
            const choice = yield* prompter.select<AgentHarness>({
              message: "Which coding agent should handle these findings?",
              options: availableHarnesses.map((harness) => ({
                label: harness === "claude" ? "Claude Code" : "Codex",
                value: harness,
              })),
            })
            const gitStatus = yield* GitStatus
            let shouldRunAgent = true

            if (yield* gitStatus.isDirty(cwd)) {
              yield* prompter.log.warning(
                "Adamantite could not confirm a clean working tree. The agent can overwrite or mix with existing changes."
              )
              shouldRunAgent = yield* prompter.confirm({
                initialValue: false,
                message: "Run the agent anyway?",
              })
            }

            if (shouldRunAgent) {
              const command = agentRunner.getCommand(choice, prompt)
              yield* prompter.log.info(
                `Running: ${[command.command, ...command.args]
                  .map((part) => JSON.stringify(part))
                  .join(" ")}`
              )

              const exitCode = yield* prompter.withSpinner(
                () => agentRunner.run(choice, prompt, cwd),
                {
                  failure: `${choice} failed to start.`,
                  start: `Running ${choice}...`,
                  success: (code) => `${choice} exited with code ${code}.`,
                }
              )

              if (exitCode !== 0) {
                yield* prompter.log.warning(`${choice} did not complete the requested repair.`)
              }

              const reassessedFindings = yield* collectCurrentAssessments().pipe(
                Effect.map((currentAssessments) => collectFindings(currentAssessments))
              )

              if (reassessedFindings.length === 0) {
                yield* prompter.log.success("The agent resolved every finding.")
                yield* prompter.outro("✅ Doctor completed successfully!")
                return
              }

              yield* prompter.log.warning("Findings remain after the agent run.")
              yield* printFindings(reassessedFindings)
            }
          }
        }
      } else {
        yield* prompter.message(prompt)
      }

      if (isInteractive) {
        yield* prompter.outro("⚠️ Doctor found issues.")
      }
      return yield* new CommandFailed({
        command: "doctor",
        exitCode: ChildProcessSpawner.ExitCode(1),
      })
    })
  )
)
