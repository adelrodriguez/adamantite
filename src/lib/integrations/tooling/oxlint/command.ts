import type { CommandRunOptions } from "#lib/execution/command-runner.ts"
import { getOxlintCommand } from "#lib/integrations/tooling/oxlint/entry.ts"

interface Options {
  readonly cwd: string
  readonly files: readonly string[]
  readonly forwardedArguments: readonly string[]
}

export function check(options: Options & { readonly allowWarnings: boolean }): CommandRunOptions {
  const entry = getOxlintCommand(options.cwd)
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
  }
}

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

export function fix(options: Options & { readonly level: FixLevel }): CommandRunOptions {
  const entry = getOxlintCommand(options.cwd)

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
  }
}
