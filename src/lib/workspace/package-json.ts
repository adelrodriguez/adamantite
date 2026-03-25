import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { FailedToReadFile, FailedToWriteFile } from "#lib/shared/errors.ts"
import { parseJson } from "#lib/shared/json.ts"

const WORKSPACE_PREFIX_REGEX = /^workspace:/
const RANGE_PREFIX_REGEX = /^[\^~]/

export function normalizeDependencyVersion(specifier: string) {
  return specifier.trim().replace(WORKSPACE_PREFIX_REGEX, "").replace(RANGE_PREFIX_REGEX, "")
}

export const readPackageJson = (cwd: string = process.cwd()) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packagePath = path.join(cwd, "package.json")
    const content = yield* fs
      .readFileString(packagePath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: packagePath })))
    const parsed = yield* parseJson(content, packagePath)
    return parsed as PackageJson
  })

export const writePackageJson = (cwd: string, packageJson: PackageJson) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packagePath = path.join(cwd, "package.json")

    yield* fs
      .writeFileString(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: packagePath })))
  })

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
