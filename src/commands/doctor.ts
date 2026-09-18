import { resolve } from "node:path"
import process from "node:process"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import type { Finding } from "#lib/integrations/base.ts"
import {
  type CodingAgent,
  CODING_AGENTS_IDS,
  checkWorkingTreeState,
  detectInstalledAgents,
  getCodingAgent,
  runHeadlessSession,
} from "#lib/agent-repair/driver.ts"
import { runRepairLoop } from "#lib/agent-repair/loop.ts"
import { assessProject, renderAssessmentMarkdown } from "#lib/integrations/assessment.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { printItemStatuses } from "#terminal/item-status.ts"
import { Prompter } from "#terminal/prompter.ts"

type ResolveAction = CodingAgent | "copy" | "done"

const version = getPackageVersion()

const agent = Flag.Literals("agent", CODING_AGENTS_IDS).pipe(
  Flag.optional,
  Flag.withDescription("Repair findings with a supported coding agent")
)

const allowDirty = Flag.Boolean("allow-dirty").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Allow an agent to edit a dirty or unknown Git working tree")
)

function failure() {
  return new CommandFailed({ command: "doctor", exitCode: ChildProcessSpawner.ExitCode(1) })
}

function legacyDeleteCommands(cwd: string, findings: readonly Finding[]): string[] {
  const paths = findings
    .filter((finding) => finding.id.includes("legacy") && finding.id.includes("config"))
    .flatMap((finding) => Array.from(finding.currentState.matchAll(/`([^`]+\.(?:json|jsonc))`/gu)))
    .map((match) => match[1])
    .filter((path): path is string => path !== undefined)
    .map((path) => `rm ${resolve(cwd, path)}`)

  return [...new Set(paths)]
}

function doctorShellPrefixes(): string[] {
  return [
    "adamantite",
    "npx adamantite",
    "pnpm exec adamantite",
    "bunx adamantite",
    "yarn adamantite",
  ].flatMap((command) => [`${command} doctor`, `${command} update`])
}

function promptForDoctorAttempt(payloadPath: string, attempt: number): string {
  return [
    `Repair every Adamantite Doctor finding in ${payloadPath}.`,
    "Run `adamantite doctor` after editing and continue until it exits 0.",
    ...(attempt > 1
      ? [
          "The previous approach did not resolve every finding. Use the updated file and try a different repair.",
        ]
      : []),
  ].join(" ")
}

export default Command.make("doctor", { agent, allowDirty }).pipe(
  Command.withDescription("Assess Adamantite-managed integrations in the current project"),
  Command.withHandler(({ agent: requestedAgent, allowDirty }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      if (isInteractive) {
        yield* prompter.intro("💠 adamantite doctor")
      }

      const initialPackageJson = yield* readPackageJson(cwd)
      if (
        !initialPackageJson.devDependencies?.adamantite
        && !initialPackageJson.dependencies?.adamantite
      ) {
        const message =
          "`adamantite` is not installed in this project. Install it before running `adamantite doctor`."
        yield* isInteractive ? prompter.log.warning(message) : prompter.message(message)
        return yield* failure()
      }

      const assessment = yield* assessProject(cwd)
      for (const warning of assessment.warnings) {
        if (isInteractive) {
          yield* prompter.log.warning(warning)
        }
      }

      if (assessment.applicableIntegrations.length === 0 || assessment.findings.length === 0) {
        if (isInteractive) {
          yield* prompter.log.success(
            assessment.applicableIntegrations.length === 0
              ? "No applicable integrations found."
              : "No issues found."
          )
          yield* prompter.outro("✅ Doctor completed successfully!")
        } else if (assessment.warnings.length > 0) {
          yield* prompter.message(renderAssessmentMarkdown(assessment, version))
        }
        return
      }

      const requested = Option.getOrUndefined(requestedAgent)
      if (requested === undefined) {
        switch (isInteractive) {
          case false:
            yield* prompter.message(renderAssessmentMarkdown(assessment, version))
            return yield* failure()
          case true:
            break
        }
      }

      if (isInteractive) {
        yield* printFindings(assessment.findings)
      }

      let selectedAgent: CodingAgent
      if (requested === undefined) {
        const installed = yield* prompter.withSpinner(() => detectInstalledAgents(cwd), {
          start: "Checking for installed coding agents...",
          success: (agents) =>
            agents.length === 0
              ? "No supported coding agent CLI was found on PATH."
              : `Found ${agents.map((candidate) => candidate.name).join(", ")}.`,
        })
        const action = yield* prompter.select<ResolveAction>({
          message: "How do you want to resolve these findings?",
          options: [
            ...installed.map((candidate) => ({
              label: `Repair with ${candidate.name}`,
              value: candidate,
            })),
            { label: "Copy the Markdown prompt for a coding agent", value: "copy" as const },
            { label: "Do nothing", value: "done" as const },
          ],
        })

        if (action === "done") {
          return yield* failure()
        }
        if (action === "copy") {
          const markdown = renderAssessmentMarkdown(assessment, version)
          yield* prompter.message(markdown)
          yield* terminal.copyToClipboard(markdown)
          return yield* failure()
        }
        selectedAgent = action
      } else {
        selectedAgent = getCodingAgent(requested)
      }

      const chosenAgent = selectedAgent
      const treeState = yield* checkWorkingTreeState(cwd)
      if (treeState !== "clean") {
        const warning =
          treeState === "dirty"
            ? "The Git working tree has uncommitted changes."
            : "Doctor could not confirm a clean Git working tree."
        if (allowDirty) {
          yield* prompter.log.warning(warning)
        } else if (isInteractive) {
          yield* prompter.log.warning(warning)
          const proceed = yield* prompter.confirm({
            initialValue: false,
            message: `Run ${chosenAgent.name} anyway?`,
          })
          if (proceed) {
            yield* prompter.log.info("Continuing on the current working tree.")
          } else {
            return yield* failure()
          }
        } else {
          yield* prompter.message(`${warning} Pass --allow-dirty to let the agent edit it.`)
          return yield* failure()
        }
      }

      if (chosenAgent.id === "codex" || chosenAgent.id === "cursor") {
        yield* prompter.log.warning(
          `${chosenAgent.name} cannot enforce Doctor's command allowlist. Review its edits before keeping them.`
        )
      }

      yield* printItemStatuses(
        assessment.findings.map((finding) => ({ label: finding.title, status: "pending" as const }))
      )

      const [result] = yield* runRepairLoop({
        attempts: 3,
        key: (finding: Finding) => finding.id,
        onInterrupt: (_unit, findings) =>
          Effect.gen(function* () {
            yield* prompter.log.warning("The agent was interrupted. Doctor reassessed the project.")
            yield* printFindings(findings)
          }),
        payloadExtension: "md",
        renderPayload: (findings) => renderAssessmentMarkdown({ ...assessment, findings }, version),
        renderPrompt: ({ attempt, payloadPath }) => promptForDoctorAttempt(payloadPath, attempt),
        runAttempt: ({ prompt }) =>
          runHeadlessSession({
            agent: chosenAgent,
            cwd,
            profile: {
              exactCommands: legacyDeleteCommands(cwd, assessment.findings),
              kind: "files-and-shell",
              shellPrefixes: doctorShellPrefixes(),
              timeout: "10 minutes",
            },
            prompt,
          }).pipe(
            Effect.map((session) => {
              if (session.status === "timed-out") {
                return { kind: "timed-out" as const, note: "The agent attempt timed out." }
              }
              if (session.exitCode !== ChildProcessSpawner.ExitCode(0)) {
                return {
                  kind: "failed" as const,
                  note:
                    session.stderr || `${chosenAgent.name} exited with code ${session.exitCode}.`,
                }
              }
              return { kind: "completed" as const }
            }),
            Effect.catchTag("AgentSessionFailed", (error) =>
              Effect.succeed({
                kind: "failed" as const,
                note:
                  error.reason === "not-found"
                    ? `\`${chosenAgent.command}\` was not found. ${chosenAgent.name} ${chosenAgent.minimumVersion} or later is required.`
                    : `Failed to start ${chosenAgent.name}: ${error.cause.message}`,
              })
            )
          ),
        verify: () => assessProject(cwd).pipe(Effect.map((next) => next.findings)),
        workUnits: [{ items: assessment.findings, unit: cwd }],
      })

      if (result === undefined) {
        return yield* failure()
      }

      yield* printItemStatuses([
        ...result.cleared.map((finding) => ({ label: finding.title, status: "done" as const })),
        ...[...result.still, ...result.introduced].map((finding) => ({
          label: finding.title,
          status: "failed" as const,
        })),
      ])
      for (const note of result.notes) {
        yield* prompter.log.warning(note)
      }

      if (result.still.length === 0 && result.introduced.length === 0) {
        if (isInteractive) {
          yield* prompter.outro("✅ Doctor completed successfully!")
        }
        return
      }

      const after = yield* assessProject(cwd)
      yield* isInteractive
        ? printFindings(after.findings)
        : prompter.message(renderAssessmentMarkdown(after, version))
      return yield* failure()
    }).pipe(
      Effect.catchTag("OperationCancelled", () =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.cancel("Doctor was cancelled. The findings remain.")
          return yield* failure()
        })
      )
    )
  )
)
