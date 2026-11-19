import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Struct from "effect/Struct"
import type { FixLevel } from "#lib/integrations/oxlint/command.ts"
import * as knip from "#lib/integrations/knip/command.ts"
import * as oxfmt from "#lib/integrations/oxfmt/command.ts"
import { printsAgentReport } from "#lib/integrations/oxlint/agent-report.ts"
import * as oxlint from "#lib/integrations/oxlint/command.ts"
import { probeAst } from "#lib/integrations/oxlint/probe.ts"
import * as sherif from "#lib/integrations/sherif/command.ts"
import * as Project from "#lib/project/index.ts"
import { type Selection, toToolNotSelected } from "#lib/project/selection.ts"
import { CommandRunner, type CommandRunOptions } from "#lib/shared/command-runner.ts"
import {
  CliNotFound,
  FailedToParseSource,
  InvalidAnalyzeOptions,
  InvalidCheckOptions,
  InvalidFixOptions,
} from "#lib/shared/errors.ts"
import { checkExists } from "#lib/shared/filesystem.ts"

export type { FixLevel } from "#lib/integrations/oxlint/command.ts"

function explainMissingTool<E>(selection: Option.Option<Selection>, error: E, tool: string) {
  return Effect.fail(Option.getOrElse(toToolNotSelected(selection, tool), () => error))
}

const printsStageHeadings = Effect.fn("printsStageHeadings")(function* (
  only: string | undefined,
  forwardedArguments: readonly string[]
) {
  return only === undefined && forwardedArguments.length === 0 && !(yield* printsAgentReport)
})

function withoutHeading<E, R>(step: Effect.Effect<CommandRunOptions, E, R>) {
  return Effect.map(step, (command): CommandRunOptions => Struct.omit(command, ["title"]))
}

export const check = Effect.fn("Bridge.check")(function* (
  options: {
    readonly allowWarnings?: boolean
    readonly files?: readonly string[]
    readonly forwardedArguments?: readonly string[]
    readonly only?: "format" | "lint"
    readonly selection?: Option.Option<Selection>
  } = {}
) {
  const { allowWarnings = false, files = [], forwardedArguments = [], only } = options

  if (only === "format" && allowWarnings) {
    return yield* new InvalidCheckOptions({
      reason: "`--allow-warnings` applies to the lint stage. Remove it or `--only format`.",
    })
  }

  const cwd = yield* Project.Directory
  const runner = yield* CommandRunner
  const forwardedStage = only ?? "lint"

  const commands = {
    format: oxfmt.check({
      cwd,
      files,
      forwardedArguments: forwardedStage === "format" ? forwardedArguments : [],
    }),
    lint: oxlint.check({
      allowWarnings,
      cwd,
      files,
      forwardedArguments: forwardedStage === "lint" ? forwardedArguments : [],
    }),
  }

  const stages = (yield* printsStageHeadings(only, forwardedArguments))
    ? commands
    : { format: withoutHeading(commands.format), lint: withoutHeading(commands.lint) }

  yield* (
    only === undefined
      ? runner.runConcurrently([stages.format, stages.lint])
      : runner.runAll([stages[only]])
  ).pipe(
    Effect.catchTag("PackageNotInstalled", (error) =>
      explainMissingTool(options.selection ?? Option.none(), error, error.packageName)
    )
  )
})

export const fix = Effect.fn("Bridge.fix")(function* (options: {
  readonly files?: readonly string[]
  readonly forwardedArguments?: readonly string[]
  readonly level?: FixLevel
  readonly only?: "format" | "lint"
  readonly selection?: Option.Option<Selection>
}) {
  const { files = [], forwardedArguments = [], level = "safe", only } = options

  if (only === "format" && level !== "safe") {
    return yield* new InvalidFixOptions({
      reason:
        "`--suggested`, `--dangerous`, and `--all` apply to the lint stage. Remove them or `--only format`.",
    })
  }

  const cwd = yield* Project.Directory
  const runner = yield* CommandRunner
  const targets = Array.dedupe(files)
  const forwardedStage = only ?? "lint"

  const commands = {
    format: oxfmt.fix({
      cwd,
      files: targets,
      forwardedArguments: forwardedStage === "format" ? forwardedArguments : [],
    }),
    lint: oxlint.fix({
      cwd,
      files: targets,
      forwardedArguments: forwardedStage === "lint" ? forwardedArguments : [],
      level,
    }),
  }

  const stages = (yield* printsStageHeadings(only, forwardedArguments))
    ? commands
    : { format: withoutHeading(commands.format), lint: withoutHeading(commands.lint) }

  // Oxlint applies one pass of fixes, so a fix that causes a new report needs a second `fix`:
  // https://github.com/oxc-project/oxc/issues/16118
  yield* runner
    .runAll(only === undefined ? [stages.lint, stages.format] : [stages[only]])
    .pipe(
      Effect.catchTag("PackageNotInstalled", (error) =>
        explainMissingTool(options.selection ?? Option.none(), error, error.packageName)
      )
    )
})

export const analyze = Effect.fn("Bridge.analyze")(function* (options: {
  readonly fix?: boolean
  readonly forwardedArguments?: readonly string[]
  readonly only?: "monorepo" | "unused"
  readonly selection?: Option.Option<Selection>
  readonly strict?: boolean
}) {
  const { fix = false, forwardedArguments = [], only, strict = false } = options
  const cwd = yield* Project.Directory
  const runner = yield* CommandRunner
  const path = yield* Path.Path

  const isMonorepo =
    only !== "unused"
    && (yield* checkExists(path.join(cwd, "package.json")))
    && (yield* Project.checkIsMonorepo().pipe(
      Effect.catchTags({
        FailedToParseFile: () => Effect.succeed(false),
        InvalidPackageJson: () => Effect.succeed(false),
      })
    ))

  if (only === "monorepo") {
    if (strict) {
      return yield* new InvalidAnalyzeOptions({
        reason: "`--strict` applies to the unused stage. Remove it or `--only monorepo`.",
      })
    }

    if (!isMonorepo) {
      return yield* new InvalidAnalyzeOptions({
        reason:
          "`--only monorepo` requires a monorepo. Run from the monorepo root, or use `--only unused` for a single-package project.",
      })
    }
  }

  const forwardedStage = only ?? "unused"

  const stages = {
    monorepo: sherif.analyze({
      cwd,
      fix,
      forwardedArguments: forwardedStage === "monorepo" ? forwardedArguments : [],
    }),
    unused: knip.analyze({
      cwd,
      fix,
      forwardedArguments: forwardedStage === "unused" ? forwardedArguments : [],
      strict,
    }),
  }

  const printsHeadings = yield* printsStageHeadings(only, forwardedArguments)

  const steps = (
    only === undefined ? [...(isMonorepo ? [stages.monorepo] : []), stages.unused] : [stages[only]]
  ).map((step) =>
    printsHeadings ? Effect.succeed(step) : withoutHeading(Effect.succeed<CommandRunOptions>(step))
  )

  // A failed Sherif fix means no install happened, and Knip would then delete from a stale
  // dependency graph.
  yield* (fix ? runner.runUntilFailure(steps) : runner.runAll(steps)).pipe(
    Effect.catchTag("CliNotFound", (error) =>
      explainMissingTool(options.selection ?? Option.none(), error, error.command)
    ),
    Effect.mapError((error) =>
      Predicate.isTagged(error, "CliNotFound") && error.command === stages.monorepo.command
        ? new CliNotFound({
            command: error.command,
            hint: "Run `adamantite update` to install it.",
          })
        : error
    )
  )
})

export const ast = Effect.fn("Bridge.ast")(function* (file: string) {
  const { errors, program } = yield* probeAst(yield* Project.Directory, file)

  if (errors.length > 0) {
    return yield* new FailedToParseSource({ errors, path: file })
  }

  if (Option.isNone(program)) {
    return yield* new FailedToParseSource({
      errors: ["Oxlint does not lint the file, so it gives rules no syntax tree."],
      path: file,
    })
  }

  return program.value
})
