import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { FixLevel } from "#lib/integrations/tooling/oxlint/command.ts"
import { CommandRunner } from "#lib/execution/command-runner.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import {
  CliNotFound,
  InvalidAnalyzeOptions,
  InvalidCheckOptions,
  InvalidFixOptions,
} from "#lib/shared/errors.ts"
import { checkExists } from "#lib/shared/filesystem.ts"
import { checkIsMonorepo } from "#lib/workspace/monorepo.ts"

export type { FixLevel } from "#lib/integrations/tooling/oxlint/command.ts"

/**
 * Checks the formatting with Oxfmt, then lints with Oxlint. Both stages run, and the operation
 * fails with the first failure. The forwarded arguments go to the lint stage, or to the stage that
 * `only` selects.
 */
export const check = Effect.fn("Toolchain.check")(function* ({
  allowWarnings = false,
  cwd,
  files = [],
  forwardedArguments = [],
  only,
}: {
  readonly allowWarnings?: boolean
  readonly cwd: string
  readonly files?: readonly string[]
  readonly forwardedArguments?: readonly string[]
  readonly only?: "format" | "lint"
}) {
  if (only === "format" && allowWarnings) {
    return yield* new InvalidCheckOptions({
      reason: "`--allow-warnings` applies to the lint stage. Remove it or `--only format`.",
    })
  }

  const runner = yield* CommandRunner
  const forwardedStage = only ?? "lint"

  const stages = {
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

  yield* runner.runAll(only === undefined ? [stages.format, stages.lint] : [stages[only]])
})

/**
 * Fixes lint issues with Oxlint, then formats with Oxfmt. Both stages run, and the operation fails
 * with the first failure. The forwarded arguments go to the lint stage, or to the stage that `only`
 * selects.
 */
export const fix = Effect.fn("Toolchain.fix")(function* ({
  cwd,
  files = [],
  forwardedArguments = [],
  level = "safe",
  only,
}: {
  readonly cwd: string
  readonly files?: readonly string[]
  readonly forwardedArguments?: readonly string[]
  readonly level?: FixLevel
  readonly only?: "format" | "lint"
}) {
  if (only === "format" && level !== "safe") {
    return yield* new InvalidFixOptions({
      reason:
        "`--suggested`, `--dangerous`, and `--all` apply to the lint stage. Remove them or `--only format`.",
    })
  }

  const runner = yield* CommandRunner
  const targets = Array.dedupe(files)
  const forwardedStage = only ?? "lint"

  const stages = {
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

  // Lint runs before Oxfmt wraps long lines, so `anti-slop/require-readable-spacing` counts a line
  // past the print width as multiline. Oxlint applies one pass of fixes, so a fix that causes a new
  // report still needs a second `fix` until Oxlint repeats its passes:
  // https://github.com/oxc-project/oxc/issues/16118
  yield* runner.runAll(only === undefined ? [stages.lint, stages.format] : [stages[only]])
})

/**
 * Analyzes the monorepo with Sherif, in a detected monorepo only, then the unused code with Knip.
 * The forwarded arguments go to the unused stage, or to the stage that `only` selects. With `fix`,
 * the operation stops at the first failure.
 */
export const analyze = Effect.fn("Toolchain.analyze")(function* ({
  cwd,
  fix = false,
  forwardedArguments = [],
  only,
  strict = false,
}: {
  readonly cwd: string
  readonly fix?: boolean
  readonly forwardedArguments?: readonly string[]
  readonly only?: "monorepo" | "unused"
  readonly strict?: boolean
}) {
  const runner = yield* CommandRunner

  const path = yield* Path.Path

  // Without a usable manifest there is no monorepo to analyze. Knip reports the manifest. Any other
  // read failure, such as of `pnpm-workspace.yaml`, could hide a monorepo, so it propagates. The
  // unused stage alone does not need to know.
  const isMonorepo =
    only !== "unused"
    && (yield* checkExists(path.join(cwd, "package.json")))
    && (yield* checkIsMonorepo(cwd).pipe(
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

  const steps =
    only === undefined ? [...(isMonorepo ? [stages.monorepo] : []), stages.unused] : [stages[only]]

  // A failed Sherif fix means no install happened, and Knip would then delete from a stale
  // dependency graph.
  yield* (fix ? runner.runUntilFailure(steps) : runner.runAll(steps)).pipe(
    Effect.mapError((error) =>
      Predicate.isTagged(error, "CliNotFound") && error.command === sherif.name
        ? new CliNotFound({
            command: error.command,
            hint: "Run `adamantite update` to install it.",
          })
        : error
    )
  )
})
