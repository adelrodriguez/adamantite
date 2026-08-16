import process from "node:process"
import type { PackageManagerName } from "nypm"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import { pipe } from "effect/Function"
import * as Path from "effect/Path"
import * as Record from "effect/Record"
import * as Result from "effect/Result"
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
    // SAFETY: the file is the project's package.json; every manifest field is optional in
    // `PackageJson`, so any parsed JSON object satisfies it.
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

/**
 * Package managers Adamantite supports for CI workflow generation. A subset of nypm's
 * `PackageManagerName`; niche managers (e.g. `aube`, `nub`) are out of scope because they lack
 * established GitHub Actions setup steps.
 */
export type SupportedPackageManager = Extract<
  PackageManagerName,
  "bun" | "deno" | "npm" | "pnpm" | "yarn"
>

export function checkIsSupportedPackageManager(
  name: PackageManagerName
): name is SupportedPackageManager {
  return name === "bun" || name === "deno" || name === "npm" || name === "pnpm" || name === "yarn"
}

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

  return pipe(
    Record.keys(MANAGED_SCRIPT_COMMANDS),
    Array.filter((name) => scripts[name] === MANAGED_SCRIPT_COMMANDS[name])
  )
}

export interface ScriptConflict {
  readonly command: string
  readonly script: Script
}

/**
 * Finds requested scripts whose existing `package.json` command differs from the managed Adamantite
 * command. Missing, empty, and already-managed scripts are not conflicts, so re-running `adamantite
 * init` stays idempotent.
 */
export function getConflictingScripts(
  packageJson: PackageJson,
  scripts: readonly Script[]
): ScriptConflict[] {
  const existing = packageJson.scripts ?? {}

  return Array.filterMap(scripts, (script) => {
    const command = existing[script]

    return command !== undefined && command !== "" && command !== MANAGED_SCRIPT_COMMANDS[script]
      ? Result.succeed({ command, script })
      : Result.failVoid
  })
}
