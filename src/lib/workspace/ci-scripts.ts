import { runScriptCommand } from "nypm"
import type { Script, SupportedPackageManager } from "#lib/workspace/package-json.ts"

const CI_SCRIPTS = ["check", "analyze"] as const satisfies readonly Script[]

export function getCIWorkflowEntries(packageManager: SupportedPackageManager, scripts: Script[]) {
  return CI_SCRIPTS.filter((script) => scripts.includes(script)).map((script) => ({
    command: runScriptCommand(packageManager, script),
    name: script,
  }))
}

export function hasCICompatibleScripts(scripts: Script[]): boolean {
  return CI_SCRIPTS.some((script) => scripts.includes(script))
}
