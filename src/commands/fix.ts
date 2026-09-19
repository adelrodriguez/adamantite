import process from "node:process"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Argument from "effect/unstable/cli/Argument"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CODING_AGENT_IDS, runHeadlessSession } from "#lib/agent-repair/driver.ts"
import { type RepairAttempt, runRepairLoop } from "#lib/agent-repair/loop.ts"
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
import {
  printRepairNotes,
  requireCodingAgent,
  warnUnenforcedPermissions,
} from "#terminal/coding-agent.ts"
import { printItemStatuses } from "#terminal/item-status.ts"

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

const agent = Flag.Literals("agent", CODING_AGENT_IDS).pipe(
  Flag.optional,
  Flag.withDescription("Repair lint diagnostics with a supported coding agent")
)

function diagnosticKey(diagnostic: OxlintDiagnostic): string {
  return `${diagnostic.rule}\0${diagnostic.message}`
}

function fileDiagnosticKey(diagnostic: OxlintDiagnostic): string {
  return `${diagnostic.file}\0${diagnosticKey(diagnostic)}`
}

function renderDiagnosticPayload(diagnostics: readonly OxlintDiagnostic[]): string {
  return JSON.stringify(
    diagnostics.map((diagnostic) => diagnostic.raw),
    null,
    2
  )
}

function diagnosticLabel(diagnostic: OxlintDiagnostic): string {
  return `${diagnostic.file}:${diagnostic.line} ${diagnostic.rule}`
}

function renderFixPrompt(
  file: string,
  { attempt, items, payloadPath }: RepairAttempt<OxlintDiagnostic>
): string {
  const issues = items.map(
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

export default Command.make("fix", { agent, all, dangerous, files, suggested }).pipe(
  Command.withDescription("Fix lint and formatting issues in code"),
  Command.withHandler(({ agent: requestedAgent, all, dangerous, files, suggested }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const targets = Array.dedupe(files)
      const fixArguments = Array.dedupe([
        "--fix",
        ...(suggested || all ? ["--fix-suggestions"] : []),
        ...(dangerous || all ? ["--fix-dangerously"] : []),
      ])
      const lintStep = {
        args: [...fixArguments, ...targets, ...forwardedArguments],
        command: oxlint.name,
        title: "🔧 Fixing lint issues",
      }
      const formatStep = {
        args: ["--write", ...targets],
        command: oxfmt.name,
        title: "✨ Formatting",
      }

      if (Option.isNone(requestedAgent)) {
        return yield* runner.runAll([lintStep, formatStep])
      }

      const chosenAgent = yield* requireCodingAgent(requestedAgent.value, cwd)
      if (chosenAgent === null) {
        return yield* failure()
      }
      yield* warnUnenforcedPermissions(chosenAgent, "the file-only permission profile")

      // Oxlint exits 1 when diagnostics remain, and the agent receives those diagnostics. An Oxfmt
      // failure still stops the run.
      yield* runner.run(lintStep).pipe(Effect.catchTag("CommandFailed", () => Effect.void))
      yield* runner.run(formatStep)

      // Type-aware rules run when the project has tsgolint, so the agent also receives them.
      const packageJson = yield* readPackageJson(cwd)
      const typeAware =
        packageJson.dependencies?.[tsgolint.name] !== undefined
        || packageJson.devDependencies?.[tsgolint.name] !== undefined
      const collect = collectOxlintDiagnostics({ cwd, forwardedArguments, targets, typeAware })
      const diagnostics = yield* collect

      if (diagnostics.length === 0) {
        return
      }

      yield* printItemStatuses("pending", diagnostics, diagnosticLabel)
      const results = yield* Effect.forEach(
        Object.entries(Array.groupBy(diagnostics, (diagnostic) => diagnostic.file)),
        ([file, items]) =>
          runRepairLoop({
            attempts: 3,
            items,
            key: diagnosticKey,
            onInterrupt: (remaining) => printItemStatuses("failed", remaining, diagnosticLabel),
            payloadExtension: "json",
            renderPayload: renderDiagnosticPayload,
            runAttempt: (attempt) =>
              runHeadlessSession({
                agent: chosenAgent,
                cwd,
                profile: { kind: "files", timeout: "5 minutes" },
                prompt: renderFixPrompt(file, attempt),
              }),
            verify: verifyOxlintFile({ cwd, file, fixArguments, forwardedArguments, typeAware }),
          }),
        { concurrency: 1 }
      )

      // A repair in one file can cause a diagnostic in a different file. The final collection of
      // every target decides the exit code, so it agrees with a plain run.
      const remaining = yield* collect
      const remainingKeys = new Set(remaining.map((diagnostic) => fileDiagnosticKey(diagnostic)))
      yield* printItemStatuses(
        "done",
        diagnostics.filter((diagnostic) => !remainingKeys.has(fileDiagnosticKey(diagnostic))),
        diagnosticLabel
      )
      yield* printItemStatuses("failed", remaining, diagnosticLabel)
      yield* printRepairNotes(results)

      if (remaining.length > 0) {
        return yield* failure()
      }
    })
  )
)
