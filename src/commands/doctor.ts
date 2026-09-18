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
  CODING_AGENT_IDS,
  checkWorkingTreeState,
  detectInstalledAgents,
  runHeadlessSession,
} from "#lib/agent-repair/driver.ts"
import { runRepairLoop } from "#lib/agent-repair/loop.ts"
import { assessProject, renderAssessmentMarkdown } from "#lib/integrations/assessment.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import {
  printRepairNotes,
  requireCodingAgent,
  warnUnenforcedPermissions,
} from "#terminal/coding-agent.ts"
import { printFindings } from "#terminal/findings.ts"
import { printItemStatuses } from "#terminal/item-status.ts"
import { Prompter } from "#terminal/prompter.ts"

const version = getPackageVersion()

const agent = Flag.Literals("agent", CODING_AGENT_IDS).pipe(
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

function findingLabel(finding: Finding): string {
  return finding.title
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
      if (isInteractive) {
        for (const warning of assessment.warnings) {
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

      if (Option.isNone(requestedAgent) && !isInteractive) {
        yield* prompter.message(renderAssessmentMarkdown(assessment, version))
        return yield* failure()
      }

      if (isInteractive) {
        yield* printFindings(assessment.findings)
      }

      const selectAction = Effect.gen(function* () {
        const installed = yield* prompter.withSpinner(() => detectInstalledAgents(cwd), {
          start: "Checking for installed coding agents...",
          success: (agents) =>
            agents.length === 0
              ? "No supported coding agent CLI was found on PATH."
              : `Found ${agents.map((candidate) => candidate.name).join(", ")}.`,
        })
        return yield* prompter.select<CodingAgent | "copy" | null>({
          message: "How do you want to resolve these findings?",
          options: [
            ...installed.map((candidate) => ({
              label: `Repair with ${candidate.name}`,
              value: candidate,
            })),
            { label: "Copy the Markdown prompt for a coding agent", value: "copy" as const },
            { label: "Do nothing", value: null },
          ],
        })
      })
      const chosenAgent = Option.isSome(requestedAgent)
        ? yield* requireCodingAgent(requestedAgent.value, cwd)
        : yield* selectAction

      if (chosenAgent === null) {
        return yield* failure()
      }
      if (chosenAgent === "copy") {
        const markdown = renderAssessmentMarkdown(assessment, version)
        yield* prompter.message(markdown)
        yield* terminal.copyToClipboard(markdown)
        return yield* failure()
      }

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

      yield* warnUnenforcedPermissions(chosenAgent, "Doctor's command allowlist")
      yield* printItemStatuses("pending", assessment.findings, findingLabel)

      const result = yield* runRepairLoop({
        attempts: 3,
        items: assessment.findings,
        key: (finding) => finding.id,
        onInterrupt: (findings) =>
          Effect.gen(function* () {
            yield* prompter.log.warning("The agent was interrupted. Doctor reassessed the project.")
            yield* printFindings(findings)
          }),
        payloadExtension: "md",
        renderPayload: (findings) => renderAssessmentMarkdown({ ...assessment, findings }, version),
        runAttempt: ({ attempt, payloadPath }) =>
          runHeadlessSession({
            agent: chosenAgent,
            cwd,
            profile: {
              exactCommands: legacyDeleteCommands(cwd, assessment.findings),
              kind: "files-and-shell",
              shellPrefixes: doctorShellPrefixes(),
              timeout: "10 minutes",
            },
            prompt: promptForDoctorAttempt(payloadPath, attempt),
          }),
        verify: assessProject(cwd).pipe(Effect.map((next) => next.findings)),
      })

      yield* printItemStatuses("done", result.cleared, findingLabel)
      yield* printItemStatuses("failed", [...result.still, ...result.introduced], findingLabel)
      yield* printRepairNotes([result])

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
