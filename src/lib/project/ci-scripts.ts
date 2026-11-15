import type { Script } from "#lib/project/package-json.ts"
import { CI_SCRIPTS } from "#lib/project/package-json.ts"
import { type SupportedPackageManager, formatRunScript } from "#lib/project/package-manager.ts"

export function getCIWorkflowEntries(packageManager: SupportedPackageManager, scripts: Script[]) {
  return CI_SCRIPTS.flatMap((script) =>
    scripts.includes(script)
      ? [{ command: formatRunScript(packageManager, script), name: script }]
      : []
  )
}

export function hasCICompatibleScripts(scripts: Script[]): boolean {
  return CI_SCRIPTS.some((script) => scripts.includes(script))
}
