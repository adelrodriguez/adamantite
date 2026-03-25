import { type PackageManagerName, runScriptCommand } from "nypm"
import type { Script } from "#lib/workspace/package-json.ts"

interface CIScriptEntry {
  readonly script: Script
  readonly name: string
  readonly args?: string[]
}

const ciScriptEntries: readonly CIScriptEntry[] = [
  { name: "check", script: "check" },
  { args: ["--check"], name: "format", script: "format" },
  { name: "monorepo", script: "check:monorepo" },
  { name: "analyze", script: "analyze" },
]

export function getCIWorkflowEntries(packageManager: PackageManagerName, scripts: Script[]) {
  const workflowEntries: Array<{ name: string; command: string }> = []

  for (const entry of ciScriptEntries) {
    if (!scripts.includes(entry.script)) {
      continue
    }

    workflowEntries.push({
      command: runScriptCommand(packageManager, entry.script, { args: entry.args }),
      name: entry.name,
    })
  }

  return workflowEntries
}

export function hasCICompatibleScripts(scripts: Script[]): boolean {
  return ciScriptEntries.some((entry) => scripts.includes(entry.script))
}
