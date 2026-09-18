import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { CODING_AGENT_IDS, runHeadlessSession } from "#lib/agent-repair/driver.ts"
import { type KnipDiagnostic, collectKnipDiagnostics } from "#lib/agent-repair/knip.ts"
import { type RepairAttempt, runRepairLoop } from "#lib/agent-repair/loop.ts"
import { type SherifDiagnostic, collectSherifDiagnostics } from "#lib/agent-repair/sherif.ts"
import {
  type CommandFailedLike,
  type CommandRunOptions,
  CommandRunner,
} from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import {
  CliNotFound,
  CommandFailed,
  InvalidAnalyzeOptions,
  type InvalidToolOutput,
} from "#lib/shared/errors.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import {
  printRepairNotes,
  requireCodingAgent,
  warnUnenforcedPermissions,
} from "#terminal/coding-agent.ts"
import { printItemStatuses } from "#terminal/item-status.ts"

type AnalyzeDiagnostic = KnipDiagnostic | SherifDiagnostic

interface Stage {
  readonly collect: (options: {
    readonly args: readonly string[]
    readonly cwd: string
  }) => Effect.Effect<
    readonly AnalyzeDiagnostic[],
    CommandFailedLike | InvalidToolOutput,
    CommandRunner
  >
  readonly command: string
  readonly fixArguments: readonly string[]
  /**
   * Run the tool's own fix before the agent. Sherif stays report-only under an agent.
   */
  readonly fixBeforeAgent: boolean
  readonly name: "monorepo" | "unused"
  /**
   * Repair each file in its own agent session. Otherwise one session repairs the project.
   */
  readonly perFile: boolean
  readonly stdin: NonNullable<CommandRunOptions["stdin"]>
  readonly strictArguments: readonly string[]
  readonly title: string
}

interface RepairUnit {
  readonly file: string | null
  readonly items: readonly AnalyzeDiagnostic[]
  readonly stage: Stage
}

const STAGES: readonly Stage[] = [
  {
    collect: collectSherifDiagnostics,
    command: sherif.name,
    fixArguments: ["--fix"],
    fixBeforeAgent: false,
    name: "monorepo",
    perFile: false,
    stdin: "inherit",
    strictArguments: [],
    title: "📦 Analyzing the monorepo",
  },
  {
    collect: collectKnipDiagnostics,
    command: knip.name,
    fixArguments: ["--fix", "--allow-remove-files"],
    fixBeforeAgent: true,
    name: "unused",
    perFile: true,
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
const agent = Flag.Literals("agent", CODING_AGENT_IDS).pipe(
  Flag.optional,
  Flag.withDescription("Repair remaining analysis findings with a supported coding agent")
)

function dependencySnapshot(packageJson: PackageJson): string {
  return JSON.stringify({
    dependencies: packageJson.dependencies,
    devDependencies: packageJson.devDependencies,
    optionalDependencies: packageJson.optionalDependencies,
    peerDependencies: packageJson.peerDependencies,
  })
}

function diagnosticKey(diagnostic: AnalyzeDiagnostic): string {
  return `${diagnostic.type}\0${diagnostic.message}`
}

function diagnosticLabel(diagnostic: AnalyzeDiagnostic): string {
  return `${diagnostic.type}: ${diagnostic.message}`
}

function toRepairUnits(stage: Stage, items: readonly AnalyzeDiagnostic[]): RepairUnit[] {
  if (stage.perFile) {
    return Object.entries(Array.groupBy(items, (item) => item.file)).map(([file, group]) => ({
      file,
      items: group,
      stage,
    }))
  }

  return items.length > 0 ? [{ file: null, items, stage }] : []
}

function renderAnalyzePrompt(
  unit: RepairUnit,
  { attempt, items, payloadPath }: RepairAttempt<AnalyzeDiagnostic>
): string {
  const scope = unit.file === null ? "the project" : `only ${unit.file}`
  return [
    `Repair ${scope} for the analysis findings in ${payloadPath}.`,
    ...items.map((item, index) => `${index + 1}. ${diagnosticLabel(item)}`),
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
  Command.withExamples([
    {
      command: "adamantite analyze -- --directory packages/app",
      description: "Run knip from a specific directory",
    },
    {
      command: "adamantite analyze --only monorepo --fix -- --select highest",
      description: "Fix only the monorepo issues and use the highest version on a mismatch",
    },
    {
      command: "adamantite analyze --agent claude",
      description: "Repair the findings that remain after Knip's fixes with Claude Code",
    },
  ]),
  Command.withHandler(({ agent: requestedAgent, fix, only, strict }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const selected = Option.getOrUndefined(only)
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
      const stageArguments = (stage: Stage) => [
        ...(strict ? stage.strictArguments : []),
        ...(stage.name === forwardedStage ? forwardedArguments : []),
      ]

      if (Option.isNone(requestedAgent)) {
        const steps = stages.map((stage) => ({
          args: [...(fix ? stage.fixArguments : []), ...stageArguments(stage)],
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

      const chosenAgent = yield* requireCodingAgent(requestedAgent.value, cwd)
      if (chosenAgent === null) {
        return yield* failure()
      }
      yield* warnUnenforcedPermissions(chosenAgent, "the file-only permission profile")

      const collect = (stage: Stage) => stage.collect({ args: stageArguments(stage), cwd })
      const collectUnits = Effect.forEach(
        stages,
        (stage) => collect(stage).pipe(Effect.map((items) => toRepairUnits(stage, items))),
        { concurrency: 1 }
      ).pipe(Effect.map((units) => units.flat()))

      for (const stage of stages.filter((candidate) => candidate.fixBeforeAgent)) {
        yield* runner.exitCode({
          args: [...stage.fixArguments, ...stageArguments(stage)],
          command: stage.command,
          cwd,
          stderr: "ignore",
          stdout: "ignore",
        })
      }

      const units = yield* collectUnits
      if (units.length === 0) {
        return
      }

      yield* printItemStatuses(
        "pending",
        units.flatMap((unit) => unit.items),
        diagnosticLabel
      )

      // The agent cannot run the package manager, so Adamantite installs its dependency changes.
      const runAgent = (prompt: string) =>
        Effect.gen(function* () {
          const before = dependencySnapshot(yield* readPackageJson(cwd))
          const outcome = yield* runHeadlessSession({
            agent: chosenAgent,
            cwd,
            profile: { kind: "files", timeout: "5 minutes" },
            prompt,
          })
          if (dependencySnapshot(yield* readPackageJson(cwd)) === before) {
            return outcome
          }

          const installer = yield* DependencyInstaller
          const packageManager = yield* installer.detectPackageManager(cwd)
          if (packageManager === null) {
            return {
              note: "The agent changed dependency versions, but no package manager was detected.",
            }
          }

          yield* runner.run({ args: ["install"], command: packageManager.name, cwd })
          return outcome
        }).pipe(Effect.catch((error) => Effect.succeed({ note: error.message })))

      const results = yield* Effect.forEach(
        units,
        (unit) =>
          runRepairLoop({
            attempts: 3,
            items: unit.items,
            key: diagnosticKey,
            onInterrupt: (remaining) => printItemStatuses("failed", remaining, diagnosticLabel),
            payloadExtension: "json",
            renderPayload: (items) =>
              JSON.stringify(
                items.map((item) => item.raw),
                null,
                2
              ),
            runAttempt: (attempt) => runAgent(renderAnalyzePrompt(unit, attempt)),
            verify: collect(unit.stage).pipe(
              Effect.map((items) =>
                unit.file === null ? items : items.filter((item) => item.file === unit.file)
              )
            ),
          }),
        { concurrency: 1 }
      )

      const remaining = results.flatMap((result) => [...result.still, ...result.introduced])
      yield* printItemStatuses(
        "done",
        results.flatMap((result) => result.cleared),
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
