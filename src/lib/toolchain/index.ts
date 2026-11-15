import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { FixLevel } from "#lib/integrations/oxlint/command.ts"
import type { Selection } from "#lib/project/selection.ts"
import * as knip from "#lib/integrations/knip/command.ts"
import * as oxfmt from "#lib/integrations/oxfmt/command.ts"
import * as oxlint from "#lib/integrations/oxlint/command.ts"
import { probeAst } from "#lib/integrations/oxlint/probe.ts"
import * as sherif from "#lib/integrations/sherif/command.ts"
import { checkIsMonorepo } from "#lib/project/monorepo.ts"
import { checkRunsTool, type ManagedTool, type Script } from "#lib/project/package-json.ts"
import { CommandRunner } from "#lib/shared/command-runner.ts"
import {
  CliNotFound,
  FailedToParseSource,
  InvalidAnalyzeOptions,
  InvalidCheckOptions,
  InvalidFixOptions,
  ToolNotSelected,
} from "#lib/shared/errors.ts"
import { checkExists } from "#lib/shared/filesystem.ts"

export type { FixLevel } from "#lib/integrations/oxlint/command.ts"

/**
 * The tool that each stage runs.
 */
const STAGE_TOOLS = {
  format: "oxfmt",
  lint: "oxlint",
  monorepo: "sherif",
  unused: "knip",
} as const satisfies Record<string, ManagedTool>

type Stage = keyof typeof STAGE_TOOLS

/**
 * Fails when `selection` includes no script that runs the tool of one of `stages`, because Setup
 * then installs no such tool. The managed script named `script` runs the tool of each stage of the
 * command of the same name. Without a selection, as in a project without a lockfile, each tool
 * runs, and a missing one reports itself.
 */
const requireSelectedTools = Effect.fn("requireSelectedTools")(function* (
  selection: Option.Option<Selection>,
  script: Script,
  stages: readonly Stage[]
) {
  const unselected = Option.match(selection, {
    onNone: () => [],
    onSome: ({ scripts }) =>
      stages.flatMap((stage) => {
        const tool = STAGE_TOOLS[stage]

        return checkRunsTool(scripts, tool) ? [] : [tool]
      }),
  })

  if (Array.isReadonlyArrayNonEmpty(unselected)) {
    return yield* new ToolNotSelected({ script, tools: unselected })
  }
})

/**
 * Checks the formatting with Oxfmt, then lints with Oxlint. Both stages run, and the operation
 * fails with the first failure. The forwarded arguments go to the lint stage, or to the stage that
 * `only` selects.
 */
export const check = Effect.fn("Toolchain.check")(function* (options: {
  readonly allowWarnings?: boolean
  readonly cwd: string
  readonly files?: readonly string[]
  readonly forwardedArguments?: readonly string[]
  readonly only?: "format" | "lint"
  /**
   * The selection that the lockfile records. A stage whose tool no selected script runs fails
   * before any stage runs. Without it, each stage runs.
   */
  readonly selection?: Option.Option<Selection>
}) {
  const { allowWarnings = false, cwd, files = [], forwardedArguments = [], only } = options

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

  const order = only === undefined ? (["format", "lint"] as const) : [only]

  yield* requireSelectedTools(options.selection ?? Option.none(), "check", order)
  yield* runner.runAll(order.map((stage) => stages[stage]))
})

/**
 * Fixes lint issues with Oxlint, then formats with Oxfmt. Both stages run, and the operation fails
 * with the first failure. The forwarded arguments go to the lint stage, or to the stage that `only`
 * selects.
 */
export const fix = Effect.fn("Toolchain.fix")(function* (options: {
  readonly cwd: string
  readonly files?: readonly string[]
  readonly forwardedArguments?: readonly string[]
  readonly level?: FixLevel
  readonly only?: "format" | "lint"
  /**
   * The selection that the lockfile records. A stage whose tool no selected script runs fails
   * before any stage runs. Without it, each stage runs.
   */
  readonly selection?: Option.Option<Selection>
}) {
  const { cwd, files = [], forwardedArguments = [], level = "safe", only } = options

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

  // Lint runs before Oxfmt wraps long lines, so `antislop/require-readable-spacing` counts a line
  // past the print width as multiline. Oxlint applies one pass of fixes, so a fix that causes a new
  // report still needs a second `fix` until Oxlint repeats its passes:
  // https://github.com/oxc-project/oxc/issues/16118
  const order = only === undefined ? (["lint", "format"] as const) : [only]

  yield* requireSelectedTools(options.selection ?? Option.none(), "fix", order)
  yield* runner.runAll(order.map((stage) => stages[stage]))
})

/**
 * Analyzes the monorepo with Sherif, in a detected monorepo only, then the unused code with Knip.
 * The forwarded arguments go to the unused stage, or to the stage that `only` selects. With `fix`,
 * the operation stops at the first failure.
 */
export const analyze = Effect.fn("Toolchain.analyze")(function* (options: {
  readonly cwd: string
  readonly fix?: boolean
  readonly forwardedArguments?: readonly string[]
  readonly only?: "monorepo" | "unused"
  /**
   * The selection that the lockfile records. A stage whose tool no selected script runs fails
   * before any stage runs. Without it, each stage runs.
   */
  readonly selection?: Option.Option<Selection>
  readonly strict?: boolean
}) {
  const { cwd, fix = false, forwardedArguments = [], only, strict = false } = options

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

  const order =
    only === undefined
      ? [...(isMonorepo ? (["monorepo"] as const) : []), "unused" as const]
      : [only]

  yield* requireSelectedTools(options.selection ?? Option.none(), "analyze", order)

  const steps = order.map((stage) => stages[stage])

  // A failed Sherif fix means no install happened, and Knip would then delete from a stale
  // dependency graph.
  yield* (fix ? runner.runUntilFailure(steps) : runner.runAll(steps)).pipe(
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
 * The syntax tree that Oxlint gives rules for `file`, relative to `cwd`, from the Oxlint runtime of
 * the project. Fails with the parse errors of a file that does not parse, and for a file that
 * Oxlint does not lint.
 */
export const ast = Effect.fn("Toolchain.ast")(function* ({
  cwd,
  file,
}: {
  readonly cwd: string
  readonly file: string
}) {
  const { errors, program } = yield* probeAst(cwd, file)

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
