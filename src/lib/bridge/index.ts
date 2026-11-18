import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { FixLevel } from "#lib/integrations/oxlint/command.ts"
import * as knip from "#lib/integrations/knip/command.ts"
import * as oxfmt from "#lib/integrations/oxfmt/command.ts"
import * as oxlint from "#lib/integrations/oxlint/command.ts"
import { probeAst } from "#lib/integrations/oxlint/probe.ts"
import * as sherif from "#lib/integrations/sherif/command.ts"
import * as Project from "#lib/project/index.ts"
import { type Selection, toToolNotSelected } from "#lib/project/selection.ts"
import { CommandRunner } from "#lib/shared/command-runner.ts"
import {
  CliNotFound,
  FailedToParseSource,
  InvalidAnalyzeOptions,
  InvalidCheckOptions,
  InvalidFixOptions,
} from "#lib/shared/errors.ts"
import { checkExists } from "#lib/shared/filesystem.ts"

export type { FixLevel } from "#lib/integrations/oxlint/command.ts"

/**
 * Replaces the failure of a tool that is not on `PATH` with `ToolNotSelected` when `selection`
 * includes no script that runs the tool, because `adamantite update` would not install it. The
 * Oxlint entry does the same for Oxlint.
 */
function explainMissingTool(selection: Option.Option<Selection>) {
  return (error: CliNotFound) =>
    Effect.fail(Option.getOrElse(toToolNotSelected(selection, error.command), () => error))
}

/**
 * Checks the formatting with Oxfmt and lints with Oxlint at the same time, and prints the format
 * stage first. Both stages run. The operation fails with a missing Oxlint before a failed stage,
 * since a failed stage already printed why, or else with the first failure. The forwarded arguments
 * go to the lint stage, or to the stage that `only` selects.
 */
export const check = Effect.fn("Bridge.check")(function* (
  options: {
    readonly allowWarnings?: boolean
    readonly files?: readonly string[]
    readonly forwardedArguments?: readonly string[]
    readonly only?: "format" | "lint"
    /**
     * The selection that the lockfile records. A tool that is not installed, and that no selected
     * script runs, fails with `ToolNotSelected`. Without it, a missing tool fails as it reports.
     */
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

  const stages = {
    format: Effect.succeed(
      oxfmt.check({
        cwd,
        files,
        forwardedArguments: forwardedStage === "format" ? forwardedArguments : [],
      })
    ),
    lint: oxlint.check({
      allowWarnings,
      cwd,
      files,
      forwardedArguments: forwardedStage === "lint" ? forwardedArguments : [],
    }),
  }

  // The stages read the files and write nothing, so they run at the same time.
  yield* (
    only === undefined
      ? runner.runConcurrently([stages.format, stages.lint])
      : runner.runAll([stages[only]])
  ).pipe(Effect.catchTag("CliNotFound", explainMissingTool(options.selection ?? Option.none())))
})

/**
 * Fixes lint issues with Oxlint, then formats with Oxfmt. Both stages run, and the operation fails
 * with the first failure. The forwarded arguments go to the lint stage, or to the stage that `only`
 * selects.
 */
export const fix = Effect.fn("Bridge.fix")(function* (options: {
  readonly files?: readonly string[]
  readonly forwardedArguments?: readonly string[]
  readonly level?: FixLevel
  readonly only?: "format" | "lint"
  /**
   * The selection that the lockfile records. A tool that is not installed, and that no selected
   * script runs, fails with `ToolNotSelected`. Without it, a missing tool fails as it reports.
   */
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

  const stages = {
    format: Effect.succeed(
      oxfmt.fix({
        cwd,
        files: targets,
        forwardedArguments: forwardedStage === "format" ? forwardedArguments : [],
      })
    ),
    lint: oxlint.fix({
      cwd,
      files: targets,
      forwardedArguments: forwardedStage === "lint" ? forwardedArguments : [],
      level,
    }),
  }

  // Lint runs before Oxfmt wraps long lines, so `antislop/require-readable-spacing` counts a line
  // past the print width as multiline. Oxlint applies one pass of fixes, so a fix that causes a new
  // report still needs a second `fix` until Oxlint repeats its passes:
  // https://github.com/oxc-project/oxc/issues/16118
  yield* runner
    .runAll(only === undefined ? [stages.lint, stages.format] : [stages[only]])
    .pipe(Effect.catchTag("CliNotFound", explainMissingTool(options.selection ?? Option.none())))
})

/**
 * Analyzes the monorepo with Sherif, in a detected monorepo only, then the unused code with Knip.
 * The forwarded arguments go to the unused stage, or to the stage that `only` selects. With `fix`,
 * the operation stops at the first failure.
 */
export const analyze = Effect.fn("Bridge.analyze")(function* (options: {
  readonly fix?: boolean
  readonly forwardedArguments?: readonly string[]
  readonly only?: "monorepo" | "unused"
  /**
   * The selection that the lockfile records. A tool that is not installed, and that no selected
   * script runs, fails with `ToolNotSelected`. Without it, a missing tool fails as it reports.
   */
  readonly selection?: Option.Option<Selection>
  readonly strict?: boolean
}) {
  const { fix = false, forwardedArguments = [], only, strict = false } = options
  const cwd = yield* Project.Directory
  const runner = yield* CommandRunner
  const path = yield* Path.Path

  // Without a usable manifest there is no monorepo to analyze. Knip reports the manifest. Any other
  // read failure, such as of `pnpm-workspace.yaml`, could hide a monorepo, so it propagates. The
  // unused stage alone does not need to know.
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

  const steps = (
    only === undefined ? [...(isMonorepo ? [stages.monorepo] : []), stages.unused] : [stages[only]]
  ).map((step) => Effect.succeed(step))

  // A failed Sherif fix means no install happened, and Knip would then delete from a stale
  // dependency graph.
  yield* (fix ? runner.runUntilFailure(steps) : runner.runAll(steps)).pipe(
    Effect.catchTag("CliNotFound", explainMissingTool(options.selection ?? Option.none())),
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

/**
 * The syntax tree that Oxlint gives rules for `file`, relative to the target project, from the
 * Oxlint runtime of the project. Fails with the parse errors of a file that does not parse, and for
 * a file that Oxlint does not lint.
 */
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
