import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Jsonc from "effect/encoding/Jsonc"
import * as Path from "effect/Path"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import { FailedToParseFile, InvalidPackageJson } from "#lib/shared/errors.ts"
import { readFile } from "#lib/shared/filesystem.ts"

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
  peerDependencies: Schema.optionalKey(StringRecord),
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

    const parsed = yield* Effect.fromResult(Jsonc.parse(content)).pipe(
      Effect.mapError((cause) => new FailedToParseFile({ cause, path: packagePath }))
    )

    yield* Schema.decodeUnknownEffect(PackageManifest)(parsed).pipe(
      Effect.mapError(
        (error) => new InvalidPackageJson({ issue: error.message, path: packagePath })
      )
    )

    // SAFETY: the decode above checked that the manifest is an object and that each field that
    // Adamantite reads has the type that `PackageJson` gives it. The manifest is returned whole,
    // because `Setup.apply` writes every field back when it sets the managed scripts.
    // oxlint-disable-next-line typescript/consistent-type-assertions -- `PackageJson` from type-fest has no schema; see the SAFETY note.
    return parsed as PackageJson
  })

/**
 * The code-quality tools that the managed scripts run, by their package and command name.
 */
export const MANAGED_TOOLS = ["knip", "oxfmt", "oxlint", "sherif"] as const

export type ManagedTool = (typeof MANAGED_TOOLS)[number]

/**
 * The package scripts that Adamantite manages: the command of each, the tools that it runs, and
 * whether CI runs it. Each other fact about a script derives from this table.
 */
const MANAGED_SCRIPTS = {
  analyze: { ci: true, command: "adamantite analyze", tools: ["knip", "sherif"] },
  check: { ci: true, command: "adamantite check", tools: ["oxfmt", "oxlint"] },
  fix: { ci: false, command: "adamantite fix", tools: ["oxfmt", "oxlint"] },
} as const satisfies Record<
  string,
  { readonly ci: boolean; readonly command: string; readonly tools: readonly ManagedTool[] }
>

export type Script = keyof typeof MANAGED_SCRIPTS

export const MANAGED_SCRIPT_COMMANDS = Record.map(MANAGED_SCRIPTS, (script) => script.command)

/**
 * Every managed script, in the order that prompts, guidance, and CI list them.
 */
export const SCRIPT_ORDER = ["check", "fix", "analyze"] as const satisfies readonly Script[]

/**
 * The managed scripts that CI runs, in `SCRIPT_ORDER`.
 */
export const CI_SCRIPTS: readonly Script[] = SCRIPT_ORDER.filter(
  (script) => MANAGED_SCRIPTS[script].ci
)

/**
 * The managed scripts that run `tool`, in `SCRIPT_ORDER`.
 */
export function getScriptsThatRun(tool: ManagedTool): Script[] {
  return SCRIPT_ORDER.filter((script) => checkRunsTool([script], tool))
}

/**
 * Whether one of `scripts` runs `tool`.
 */
export function checkRunsTool(scripts: readonly Script[], tool: ManagedTool): boolean {
  return scripts.some((script) => {
    const tools: readonly ManagedTool[] = MANAGED_SCRIPTS[script].tools

    return tools.includes(tool)
  })
}
