import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import {
  type CodingAgent,
  CODING_AGENTS_IDS,
  detectInstalledAgents,
  getCodingAgent,
  runHeadlessSession,
} from "#lib/agent-repair/driver.ts"
import { runRepairLoop } from "#lib/agent-repair/loop.ts"
import {
  collectOxlintDiagnostics,
  type OxlintDiagnostic,
  verifyOxlintFile,
} from "#lib/agent-repair/oxlint.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printItemStatuses } from "#terminal/item-status.ts"
import { Prompter } from "#terminal/prompter.ts"

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

const agent = Flag.Literals("agent", CODING_AGENTS_IDS).pipe(
  Flag.optional,
  Flag.withDescription("Repair lint diagnostics with a supported coding agent")
)

function diagnosticKey(diagnostic: OxlintDiagnostic): string {
  return `${diagnostic.rule}\0${diagnostic.message}`
}

function renderDiagnosticPayload(diagnostics: readonly OxlintDiagnostic[]): string {
  return JSON.stringify(
    diagnostics.map((diagnostic) => diagnostic.raw),
    null,
    2
  )
}

function renderFixPrompt(
  file: string,
  diagnostics: readonly OxlintDiagnostic[],
  payloadPath: string,
  attempt: number
): string {
  const issues = diagnostics.map(
    (diagnostic, index) =>
      `${index + 1}. ${diagnostic.line}:${diagnostic.column} ${diagnostic.rule}: ${diagnostic.message}`
  )

  return [
    `Edit only ${file}.`,
    ...issues,
    `Full Oxlint diagnostics are in ${payloadPath}.`,
    "Make the smallest code change that fixes the issues. Do not add suppression comments, change configuration, or reformat unrelated code. The file will be linted again, so cosmetic changes do not count.",
    ...(attempt > 1
      ? ["The previous approach did not resolve every issue. Try a different repair."]
      : []),
  ].join("\n")
}

function failure() {
  return new CommandFailed({ command: "oxlint", exitCode: ChildProcessSpawner.ExitCode(1) })
}

function groupDiagnosticsByFile(diagnostics: readonly OxlintDiagnostic[]) {
  const groups = new Map<string, OxlintDiagnostic[]>()

  for (const diagnostic of diagnostics) {
    const group = groups.get(diagnostic.file) ?? []
    group.push(diagnostic)
    groups.set(diagnostic.file, group)
  }

  return groups
}

export default Command.make("fix", { agent, all, dangerous, files, suggested }).pipe(
  Command.withDescription("Fix lint and formatting issues in code"),
  Command.withHandler(({ agent: requestedAgent, all, dangerous, files, suggested }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const terminal = yield* TerminalCapabilities
      const prompter = yield* Prompter
      const isInteractive = yield* terminal.isInteractive
      const targets = Array.dedupe(files)
      const fixArguments = Array.dedupe([
        "--fix",
        ...(suggested || all ? ["--fix-suggestions"] : []),
        ...(dangerous || all ? ["--fix-dangerously"] : []),
      ])
      const requested = Option.getOrUndefined(requestedAgent)

      if (requested === undefined && !isInteractive) {
        return yield* runner.runAll([
          {
            args: [...fixArguments, ...targets, ...forwardedArguments],
            command: oxlint.name,
            title: "🔧 Fixing lint issues",
          },
          { args: ["--write", ...targets], command: oxfmt.name, title: "✨ Formatting" },
        ])
      }

      yield* runner.exitCode({
        args: [...fixArguments, ...targets, ...forwardedArguments],
        command: oxlint.name,
        cwd,
      })
      yield* runner.run({
        args: ["--write", ...targets],
        command: oxfmt.name,
        cwd,
        title: "✨ Formatting",
      })
      const diagnostics = yield* collectOxlintDiagnostics({ cwd, forwardedArguments, targets })

      if (diagnostics.length === 0) {
        return
      }

      let selectedAgent: CodingAgent
      if (requested === undefined) {
        const installed = yield* detectInstalledAgents(cwd)
        const selection = yield* prompter.select<CodingAgent | null>({
          message: "Oxlint found issues it could not fix. Repair them with an agent?",
          options: [
            ...installed.map((candidate) => ({ label: candidate.name, value: candidate })),
            { label: "Do nothing", value: null },
          ],
        })
        if (selection === null) {
          return yield* failure()
        }
        selectedAgent = selection
      } else {
        selectedAgent = getCodingAgent(requested)
      }

      const chosenAgent = selectedAgent
      if (chosenAgent.id === "codex" || chosenAgent.id === "cursor") {
        yield* prompter.log.warning(
          `${chosenAgent.name} cannot enforce the file-only permission profile. Review its edits before keeping them.`
        )
      }

      const byFile = groupDiagnosticsByFile(diagnostics)
      yield* printItemStatuses(
        diagnostics.map((diagnostic) => ({
          label: `${diagnostic.file}:${diagnostic.line} ${diagnostic.rule}`,
          status: "pending" as const,
        }))
      )
      const results = yield* runRepairLoop({
        attempts: 3,
        key: diagnosticKey,
        onInterrupt: (file, remaining) =>
          printItemStatuses(
            remaining.map((diagnostic) => ({
              label: `${file}:${diagnostic.line} ${diagnostic.rule}`,
              status: "failed" as const,
            }))
          ),
        payloadExtension: "json",
        renderPayload: renderDiagnosticPayload,
        renderPrompt: ({ attempt, items, payloadPath, unit }) =>
          renderFixPrompt(unit, items, payloadPath, attempt),
        runAttempt: ({ prompt }) =>
          runHeadlessSession({
            agent: chosenAgent,
            cwd,
            profile: { kind: "files", timeout: "5 minutes" },
            prompt,
          }).pipe(
            Effect.map((session) =>
              session.status === "timed-out"
                ? { kind: "timed-out" as const, note: "The agent attempt timed out." }
                : session.exitCode === ChildProcessSpawner.ExitCode(0)
                  ? { kind: "completed" as const }
                  : {
                      kind: "failed" as const,
                      note: session.stderr || `${chosenAgent.name} failed.`,
                    }
            ),
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
        verify: (file) => verifyOxlintFile({ cwd, file, fixArguments, forwardedArguments }),
        workUnits: [...byFile].map(([file, items]) => ({ items, unit: file })),
      })

      const packageJson = yield* readPackageJson(cwd)
      const hasTsgolint =
        packageJson.dependencies?.[tsgolint.name] !== undefined
        || packageJson.devDependencies?.[tsgolint.name] !== undefined
      const typeAware = hasTsgolint
        ? yield* collectOxlintDiagnostics({
            cwd,
            forwardedArguments,
            targets,
            typeAware: true,
          })
        : []
      const remaining = [
        ...results.flatMap((result) => [...result.still, ...result.introduced]),
        ...typeAware,
      ]

      yield* printItemStatuses([
        ...results.flatMap((result) =>
          result.cleared.map((diagnostic) => ({
            label: `${diagnostic.file}:${diagnostic.line} ${diagnostic.rule}`,
            status: "done" as const,
          }))
        ),
        ...remaining.map((diagnostic) => ({
          label: `${diagnostic.file}:${diagnostic.line} ${diagnostic.rule}`,
          status: "failed" as const,
        })),
      ])

      if (remaining.length > 0) {
        return yield* failure()
      }
    })
  )
)
