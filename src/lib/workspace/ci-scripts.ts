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

export function hasCICompatibleScripts(scripts: Script[]): boolean {
  return CI_SCRIPTS.some((script) => scripts.includes(script))
}
