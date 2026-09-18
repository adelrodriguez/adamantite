import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import {
  type AnalyzeDiagnostic,
  applyKnipFixes,
  collectKnipDiagnostics,
  collectSherifDiagnostics,
} from "#lib/agent-repair/analyze.ts"
import {
  type CodingAgent,
  CODING_AGENTS_IDS,
  detectInstalledAgents,
  getCodingAgent,
  runHeadlessSession,
} from "#lib/agent-repair/driver.ts"
import { type RepairWorkUnit, runRepairLoop } from "#lib/agent-repair/loop.ts"
import { type CommandRunOptions, CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import { CliNotFound, CommandFailed, InvalidAnalyzeOptions } from "#lib/shared/errors.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printItemStatuses } from "#terminal/item-status.ts"
import { Prompter } from "#terminal/prompter.ts"

type StageName = "monorepo" | "unused"
type AnalyzeUnit =
  | { readonly stage: "monorepo" }
  | { readonly file: string; readonly stage: "unused" }

interface Stage {
  readonly command: string
  readonly fixArguments: readonly string[]
  readonly name: StageName
  readonly stdin: NonNullable<CommandRunOptions["stdin"]>
  readonly strictArguments: readonly string[]
  readonly title: string
}

const STAGES: readonly Stage[] = [
  {
    command: sherif.name,
    fixArguments: ["--fix"],
    name: "monorepo",
    stdin: "inherit",
    strictArguments: [],
    title: "📦 Analyzing the monorepo",
  },
  {
    command: knip.name,
    fixArguments: ["--fix", "--allow-remove-files"],
    name: "unused",
    stdin: "ignore",
    strictArguments: ["--production", "--strict"],
    title: "🧹 Analyzing unused code",
  },
]

const fix = Flag.Boolean("fix").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Automatically fix issues in every stage that runs")
)
const strict = Flag.Boolean("strict").pipe(
  Flag.withDefault(false),
  Flag.withDescription("Enable strict mode for the unused stage (knip)")
)
const only = Flag.Literals("only", ["monorepo", "unused"]).pipe(
  Flag.optional,
  Flag.withDescription(
    "Run one stage: `monorepo` (sherif, monorepos only) or `unused` (knip). Arguments after `--` go to that stage"
  )
)
const agent = Flag.Literals("agent", CODING_AGENTS_IDS).pipe(
  Flag.optional,
  Flag.withDescription("Repair remaining analysis findings with a supported coding agent")
)

function groupUnusedDiagnostics(diagnostics: readonly AnalyzeDiagnostic[]) {
  const groups = new Map<string, AnalyzeDiagnostic[]>()
  for (const diagnostic of diagnostics) {
    if (diagnostic.stage !== "unused") {
      continue
    }
    const group = groups.get(diagnostic.file) ?? []
    group.push(diagnostic)
    groups.set(diagnostic.file, group)
  }
  return groups
}

function dependencySnapshot(packageJson: PackageJson): string {
  return JSON.stringify({
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
    optionalDependencies: packageJson.optionalDependencies,
    peerDependencies: packageJson.peerDependencies,
  })
}

function errorMessage(error: Error): string {
  return error.message
}

function diagnosticKey(diagnostic: AnalyzeDiagnostic): string {
  return `${diagnostic.stage}\0${diagnostic.type}\0${diagnostic.message}`
}

function renderAnalyzePrompt(
  unit: AnalyzeUnit,
  items: readonly AnalyzeDiagnostic[],
  payloadPath: string,
  attempt: number
): string {
  const scope = unit.stage === "monorepo" ? "the project" : `only ${unit.file}`
  return [
    `Repair ${scope} for the analysis findings in ${payloadPath}.`,
    ...items.map((item, index) => `${index + 1}. ${item.type}: ${item.message}`),
    "Make minimal changes. Do not add suppressions, change analysis configuration, or make unrelated edits.",
    ...(attempt > 1
      ? ["The previous approach did not resolve every finding. Try a different repair."]
      : []),
  ].join("\n")
}

function failure() {
  return new CommandFailed({ command: "analyze", exitCode: ChildProcessSpawner.ExitCode(1) })
}

export default Command.make("analyze", { agent, fix, only, strict }).pipe(
  Command.withDescription(
    "Find monorepo issues using sherif, then unused dependencies, exports, and files using knip"
  ),
  Command.withHandler(({ agent: requestedAgent, fix, only, strict }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const terminal = yield* TerminalCapabilities
      const prompter = yield* Prompter
      const selected = Option.getOrUndefined(only)
      const requested = Option.getOrUndefined(requestedAgent)
      const isInteractive = yield* terminal.isInteractive
      const isMonorepo = yield* checkIsMonorepo().pipe(
        Effect.catchTags({
          FailedToParseFile: () => Effect.succeed(false),
          FailedToReadFile: () => Effect.succeed(false),
        })
      )

      if (selected === "monorepo") {
        if (strict) {
          return yield* new InvalidAnalyzeOptions({
            reason: "`--strict` applies to the unused stage. Remove it or `--only monorepo`.",
          })
        }
        if (!isMonorepo) {
          return yield* new InvalidAnalyzeOptions({
            reason: "`--only monorepo` needs a monorepo, and no monorepo was detected.",
          })
        }
      }

      const stages = STAGES.filter((stage) =>
        selected === undefined ? stage.name === "unused" || isMonorepo : stage.name === selected
      )
      const forwardedStage = selected ?? "unused"

      if (requested === undefined && !isInteractive) {
        const steps = stages.map((stage) => ({
          args: [
            ...(fix ? stage.fixArguments : []),
            ...(strict ? stage.strictArguments : []),
            ...(stage.name === forwardedStage ? forwardedArguments : []),
          ],
          command: stage.command,
          stdin: stage.stdin,
          title: stage.title,
        }))
        return yield* (fix ? runner.runUntilFailure(steps) : runner.runAll(steps)).pipe(
          Effect.mapError((error) =>
            error._tag === "CliNotFound" && error.command === sherif.name
              ? new CliNotFound({
                  command: error.command,
                  hint: "Run `adamantite update` to install it.",
                })
              : error
          )
        )
      }

      const collectStage = (stage: Stage) =>
        stage.name === "monorepo"
          ? collectSherifDiagnostics({
              cwd,
              forwardedArguments: stage.name === forwardedStage ? forwardedArguments : [],
            })
          : collectKnipDiagnostics({
              cwd,
              forwardedArguments: stage.name === forwardedStage ? forwardedArguments : [],
              strict,
            })
      let diagnostics = (yield* Effect.all(
        stages.map((stage) => collectStage(stage)),
        { concurrency: 1 }
      )).flat()
      if (diagnostics.length === 0) {
        return
      }

      let selectedAgent: CodingAgent
      if (requested === undefined) {
        const installed = yield* detectInstalledAgents(cwd)
        const selection = yield* prompter.select<CodingAgent | null>({
          message: "Analysis found issues. Repair them with an agent?",
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

      if (stages.some((stage) => stage.name === "unused")) {
        yield* applyKnipFixes({
          cwd,
          forwardedArguments: forwardedStage === "unused" ? forwardedArguments : [],
          strict,
        })
        diagnostics = (yield* Effect.all(
          stages.map((stage) => collectStage(stage)),
          { concurrency: 1 }
        )).flat()
      }

      const monorepoItems = diagnostics.filter((item) => item.stage === "monorepo")
      const unusedGroups = groupUnusedDiagnostics(diagnostics)
      const workUnits: Array<RepairWorkUnit<AnalyzeUnit, AnalyzeDiagnostic>> = [
        ...(monorepoItems.length > 0
          ? [{ items: monorepoItems, unit: { stage: "monorepo" as const } }]
          : []),
        ...[...unusedGroups].map(([file, items]) => ({
          items,
          unit: { file, stage: "unused" as const },
        })),
      ]

      yield* printItemStatuses(
        diagnostics.map((item) => ({
          label: `${item.type}: ${item.message}`,
          status: "pending" as const,
        }))
      )

      const results = yield* runRepairLoop({
        attempts: 3,
        key: diagnosticKey,
        onInterrupt: (_unit, remaining) =>
          printItemStatuses(
            remaining.map((item) => ({
              label: `${item.type}: ${item.message}`,
              status: "failed" as const,
            }))
          ),
        payloadExtension: "json",
        renderPayload: (items) =>
          JSON.stringify(
            items.map((item) => item.raw),
            null,
            2
          ),
        renderPrompt: ({ attempt, items, payloadPath, unit }) =>
          renderAnalyzePrompt(unit, items, payloadPath, attempt),
        runAttempt: ({ prompt }) =>
          Effect.gen(function* () {
            const before = dependencySnapshot(yield* readPackageJson(cwd))
            const outcome = yield* runHeadlessSession({
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
            )
            const after = dependencySnapshot(yield* readPackageJson(cwd))
            if (after !== before) {
              const installer = yield* DependencyInstaller
              const packageManager = yield* installer.detectPackageManager(cwd)
              if (packageManager === null) {
                return {
                  kind: "failed" as const,
                  note: "The agent changed dependency versions, but no package manager was detected.",
                }
              }
              const installError = yield* runner
                .run({ args: ["install"], command: packageManager.name, cwd })
                .pipe(
                  Effect.as<string | null>(null),
                  Effect.catch((error) => Effect.succeed(errorMessage(error)))
                )
              if (installError !== null) {
                return { kind: "failed" as const, note: installError }
              }
            }
            return outcome
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed({ kind: "failed" as const, note: errorMessage(error) })
            )
          ),
        verify: (unit) =>
          unit.stage === "monorepo"
            ? collectSherifDiagnostics({
                cwd,
                forwardedArguments: forwardedStage === "monorepo" ? forwardedArguments : [],
              })
            : collectKnipDiagnostics({
                cwd,
                forwardedArguments: forwardedStage === "unused" ? forwardedArguments : [],
                strict,
              }).pipe(Effect.map((items) => items.filter((item) => item.file === unit.file))),
        workUnits,
      })

      const remaining = results.flatMap((result) => [...result.still, ...result.introduced])
      yield* printItemStatuses([
        ...results.flatMap((result) =>
          result.cleared.map((item) => ({
            label: `${item.type}: ${item.message}`,
            status: "done" as const,
          }))
        ),
        ...remaining.map((item) => ({
          label: `${item.type}: ${item.message}`,
          status: "failed" as const,
        })),
      ])
      if (remaining.length > 0) {
        return yield* failure()
      }
    })
  )
)
