import * as Effect from "effect/Effect"
import type { CommandRunOptions } from "#lib/shared/command-runner.ts"
import { getOxlintCommand } from "#lib/integrations/oxlint/entry.ts"

interface Options {
  readonly cwd: string
  readonly files: readonly string[]
  readonly forwardedArguments: readonly string[]
}

export const check = Effect.fn("Oxlint.check")(function* (
  options: Options & { readonly allowWarnings: boolean }
) {
  const entry = yield* getOxlintCommand(options.cwd)

  // A forwarded `--deny-warnings` or `--max-warnings` is the project's own warning policy, and
  // Oxlint rejects `--deny-warnings` twice.
  const forwardsWarningPolicy = options.forwardedArguments.some(
    (argument) => argument === "--deny-warnings" || argument.startsWith("--max-warnings")
  )

  const denyWarnings = options.allowWarnings || forwardsWarningPolicy ? [] : ["--deny-warnings"]

  return {
    ...entry,
    args: [...entry.args, ...options.files, ...denyWarnings, ...options.forwardedArguments],
    title: "🔍 Linting",
  } satisfies CommandRunOptions
})

/**
 * The Oxlint fixes to apply on top of the safe fixes: none, the suggested fixes, the dangerous
 * fixes, or both.
 */
export type FixLevel = "all" | "dangerous" | "safe" | "suggested"

const FIX_LEVEL_FLAGS = {
  all: ["--fix-suggestions", "--fix-dangerously"],
  dangerous: ["--fix-dangerously"],
  safe: [],
  suggested: ["--fix-suggestions"],
} as const satisfies Record<FixLevel, readonly string[]>

export const fix = Effect.fn("Oxlint.fix")(function* (
  options: Options & { readonly level: FixLevel }
) {
  const entry = yield* getOxlintCommand(options.cwd)

  return {
    ...entry,
    args: [
      ...entry.args,
      "--fix",
      ...FIX_LEVEL_FLAGS[options.level],
      ...options.files,
      ...options.forwardedArguments,
    ],
    title: "🔧 Fixing lint issues",
  } satisfies CommandRunOptions
})
