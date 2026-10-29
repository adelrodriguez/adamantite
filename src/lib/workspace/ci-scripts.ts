import { runScriptCommand } from "nypm"
import type { Script, SupportedPackageManager } from "#lib/workspace/package-json.ts"

const CI_SCRIPTS = ["check", "analyze"] as const satisfies readonly Script[]

/**
 * The command that runs `adamantite rule test` with each package manager. No managed script runs
 * the custom rule tests, so the workflow runs the installed CLI directly.
 */
export const RULE_TEST_COMMANDS = {
  bun: "bunx adamantite rule test",
  deno: "deno run -A npm:adamantite rule test",
  npm: "npx adamantite rule test",
  pnpm: "pnpm exec adamantite rule test",
  yarn: "yarn adamantite rule test",
} as const satisfies Record<SupportedPackageManager, string>

export function getCIWorkflowEntries(
  packageManager: SupportedPackageManager,
  scripts: Script[],
  { hasRuleTests }: { readonly hasRuleTests: boolean }
) {
  return [
    ...CI_SCRIPTS.filter((script) => scripts.includes(script)).map((script) => ({
      command: runScriptCommand(packageManager, script),
      name: script,
    })),
    ...(hasRuleTests ? [{ command: RULE_TEST_COMMANDS[packageManager], name: "rule test" }] : []),
  ]
}

export function hasCICompatibleScripts(scripts: Script[]): boolean {
  return CI_SCRIPTS.some((script) => scripts.includes(script))
}
