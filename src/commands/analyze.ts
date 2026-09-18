import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import { type CommandRunOptions, CommandRunner } from "#lib/execution/command-runner.ts"
import { ForwardedArguments } from "#lib/execution/forwarded-arguments.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import { CliNotFound, InvalidAnalyzeOptions } from "#lib/shared/errors.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"

type StageName = "monorepo" | "unused"

interface Stage {
  readonly checkArguments: readonly string[]
  readonly command: string
  readonly fixArguments: readonly string[]
  readonly name: StageName
  readonly stdin: NonNullable<CommandRunOptions["stdin"]>
  readonly strictArguments: readonly string[]
  readonly title: string
}

/**
 * The stages of `analyze`, in run order. The monorepo stage runs only in a detected monorepo.
 */
const STAGES: readonly Stage[] = [
  {
    checkArguments: [],
    command: sherif.name,
    fixArguments: ["--fix"],
    name: "monorepo",
    // Sherif prompts for a version when a fix has more than one candidate.
    stdin: "inherit",
    strictArguments: [],
    title: "📦 Analyzing the monorepo",
  },
  {
    checkArguments: [],
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

export default Command.make("analyze", { fix, only, strict }).pipe(
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
  ]),
  Command.withHandler(({ fix, only, strict }) =>
    Effect.gen(function* () {
      const forwardedArguments = yield* ForwardedArguments
      const runner = yield* CommandRunner
      const selected = Option.getOrUndefined(only)

      if (selected === "monorepo" && strict) {
        return yield* new InvalidAnalyzeOptions({
          reason: "`--strict` applies to the unused stage. Remove it or `--only monorepo`.",
        })
      }

      // Outside a project there is no monorepo to analyze; Knip reports the missing manifest.
      const isMonorepo = yield* checkIsMonorepo().pipe(
        Effect.catchTag("FailedToReadFile", () => Effect.succeed(false))
      )

      if (selected === "monorepo" && !isMonorepo) {
        return yield* new InvalidAnalyzeOptions({
          reason: "`--only monorepo` needs a monorepo, and no monorepo was detected.",
        })
      }

      const stages = STAGES.filter((stage) =>
        selected === undefined ? stage.name === "unused" || isMonorepo : stage.name === selected
      )
      const forwardedStage = selected ?? "unused"

      // A failed Sherif fix means no install happened, and Knip would then delete from a stale
      // dependency graph.
      yield* runner
        .runAll(
          stages.map((stage) => ({
            args: [
              ...(fix ? stage.fixArguments : stage.checkArguments),
              ...(strict ? stage.strictArguments : []),
              ...(stage.name === forwardedStage ? forwardedArguments : []),
            ],
            command: stage.command,
            stdin: stage.stdin,
            title: stage.title,
          })),
          { stopOnFailure: fix }
        )
        .pipe(
          Effect.catchTag("CliNotFound", (error) =>
            Effect.fail(
              error.command === sherif.name
                ? new CliNotFound({
                    command: error.command,
                    hint: "Run `adamantite update` to install it.",
                  })
                : error
            )
          )
        )
    })
  )
)
