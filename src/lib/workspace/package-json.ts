import process from "node:process"
import type { PackageManagerName } from "nypm"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Path from "effect/Path"
import * as Record from "effect/Record"
import * as Result from "effect/Result"
import * as Schema from "effect/Schema"
import { InvalidPackageJson } from "#lib/shared/errors.ts"
import { readFile, writeFile } from "#lib/shared/filesystem.ts"
import { parseJson, updateJsonText } from "#lib/shared/json.ts"

const WORKSPACE_PREFIX_REGEX = /^workspace:/
const RANGE_PREFIX_REGEX = /^[\^~]/
const VERSION_REGEX = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/
const CATALOG_PROTOCOL = "catalog:"

/**
 * What a dependency specifier in `package.json` says about the version of the package.
 */
export type DeclaredVersion =
  /**
   * A pnpm catalog entry, such as `catalog:` for the default catalog or `catalog:tools`.
   */
  | { readonly _tag: "Catalog"; readonly catalog: string }
  /**
   * A specifier whose version Adamantite cannot read, such as `npm:`, `link:`, or `>=1.0.0`.
   */
  | { readonly _tag: "Unreadable" }
  /**
   * A version, with an optional `workspace:` protocol and one `^` or `~` prefix.
   */
  | { readonly _tag: "Version"; readonly version: string }

const {
  $match: matchDeclaredVersion,
  Catalog,
  Unreadable,
  Version,
} = Data.taggedEnum<DeclaredVersion>()

export { matchDeclaredVersion }

export function parseDependencySpecifier(specifier: string): DeclaredVersion {
  const trimmed = specifier.trim()

  if (trimmed.startsWith(CATALOG_PROTOCOL)) {
    return Catalog({ catalog: trimmed.slice(CATALOG_PROTOCOL.length) || "default" })
  }

  const version = trimmed.replace(WORKSPACE_PREFIX_REGEX, "").replace(RANGE_PREFIX_REGEX, "")

  return VERSION_REGEX.test(version) ? Version({ version }) : Unreadable()
}

const StringRecord = Schema.Record(Schema.String, Schema.String)

/**
 * The `package.json` fields that Adamantite reads, with the types that the code relies on.
 */
const PackageManifest = Schema.Struct({
  dependencies: Schema.optionalKey(StringRecord),
  devDependencies: Schema.optionalKey(StringRecord),
  name: Schema.optionalKey(Schema.String),
  scripts: Schema.optionalKey(StringRecord),
  version: Schema.optionalKey(Schema.String),
  workspaces: Schema.optionalKey(
    Schema.Union([
      Schema.Array(Schema.String),
      Schema.Struct({ packages: Schema.optionalKey(Schema.Array(Schema.String)) }),
    ])
  ),
})

export const readPackageJson = (cwd: string = process.cwd()) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const packagePath = path.join(cwd, "package.json")
    const content = yield* readFile(packagePath)
    const parsed = yield* parseJson(content, packagePath)

    yield* Schema.decodeUnknownEffect(PackageManifest)(parsed).pipe(
      Effect.mapError(
        (error) => new InvalidPackageJson({ issue: error.message, path: packagePath })
      )
    )

    // SAFETY: the decode above checked that the manifest is an object and that each field that
    // Adamantite reads has the type that `PackageJson` gives it. The manifest is returned whole,
    // because `writePackageJson` writes every field back.
    // oxlint-disable-next-line typescript/consistent-type-assertions -- `PackageJson` from type-fest has no schema; see the SAFETY note.
    return parsed as PackageJson
  })

/**
 * Writes the changed fields of `packageJson` into the existing `package.json`, and keeps the file's
 * formatting.
 */
export const writePackageJson = (cwd: string, packageJson: PackageJson) =>
  Effect.gen(function* () {
    const path = yield* Path.Path
    const packagePath = path.join(cwd, "package.json")
    const content = yield* readFile(packagePath)
    yield* writeFile(packagePath, updateJsonText(content, packageJson))
  })

export type Script = keyof typeof MANAGED_SCRIPT_COMMANDS

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
  fix: "adamantite fix",
} as const

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
