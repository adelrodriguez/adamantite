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

type DeclaredVersion =
  | { readonly _tag: "Catalog"; readonly catalog: string }
  | { readonly _tag: "Unreadable" }
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

export const readPackageJson = (cwd: string) =>
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

export const MANAGED_TOOLS = ["knip", "oxfmt", "oxlint", "sherif"] as const

type ManagedTool = (typeof MANAGED_TOOLS)[number]

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

export const SCRIPT_ORDER = ["check", "fix", "analyze"] as const satisfies readonly Script[]

export const CI_SCRIPTS: readonly Script[] = SCRIPT_ORDER.filter(
  (script) => MANAGED_SCRIPTS[script].ci
)

export function hasCICompatibleScripts(scripts: readonly Script[]): boolean {
  return CI_SCRIPTS.some((script) => scripts.includes(script))
}

export function getScriptsThatRun(tool: ManagedTool): Script[] {
  return SCRIPT_ORDER.filter((script) => checkRunsTool([script], tool))
}

export function checkRunsTool(scripts: readonly Script[], tool: ManagedTool): boolean {
  return scripts.some((script) => {
    const tools: readonly ManagedTool[] = MANAGED_SCRIPTS[script].tools

    return tools.includes(tool)
  })
}
