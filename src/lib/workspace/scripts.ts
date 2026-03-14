import type { PackageJson } from "type-fest"

/**
 * Available scripts that can be added to package.json during initialization.
 */
export type Script = "check" | "fix" | "format" | "check:monorepo" | "fix:monorepo" | "analyze"

export const MANAGED_SCRIPT_COMMANDS = {
  analyze: "adamantite analyze",
  check: "adamantite check",
  "check:monorepo": "adamantite monorepo",
  fix: "adamantite fix",
  "fix:monorepo": "adamantite monorepo --fix",
  format: "adamantite format",
} as const satisfies Record<Script, string>

export function getManagedScripts(packageJson: PackageJson): Script[] {
  const scripts = packageJson.scripts ?? {}
  const managedScripts: Script[] = []

  for (const [name, command] of Object.entries(MANAGED_SCRIPT_COMMANDS) as Array<
    [Script, string]
  >) {
    if (scripts[name] === command) {
      managedScripts.push(name)
    }
  }

  return managedScripts
}
