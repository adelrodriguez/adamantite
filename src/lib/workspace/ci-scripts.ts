import { runScriptCommand } from "nypm"
import type { Script, SupportedPackageManager } from "#lib/workspace/package-json.ts"
import { CI_SCRIPTS } from "#lib/workspace/package-json.ts"

export function getCIWorkflowEntries(packageManager: SupportedPackageManager, scripts: Script[]) {
  return CI_SCRIPTS.flatMap((script) =>
    scripts.includes(script)
      ? [{ command: runScriptCommand(packageManager, script), name: script }]
      : []
  )
}

/**
 * Each non-empty set of CI scripts, in CI order.
 */
export function getCIScriptSets(): Script[][] {
  const sets = CI_SCRIPTS.reduce<Script[][]>(
    (previous, script) => previous.flatMap((set) => [set, [...set, script]]),
    [[]]
  )

  return sets.filter((set) => set.length > 0)
}

export function hasCICompatibleScripts(scripts: Script[]): boolean {
  return CI_SCRIPTS.some((script) => scripts.includes(script))
}
