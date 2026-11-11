import type { JsonObject, JsonValue, PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { Project } from "#lib/workspace/project.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { readFile, readFileIfExists, writeFile, writeJsonFile } from "#lib/shared/filesystem.ts"
import { mergeConfig, parseJson, updateJsonText } from "#lib/shared/json.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import { ModuleResolver, resolvePackageDirectory } from "#lib/workspace/module-resolver.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

const files = [{ path: "tsconfig.json", type: "config" }] as const

/**
 * The values of `--typescript`. `typescript` adds the type resets to the strict options of
 * `tsconfig`, so a config that extends both counts as `typescript`.
 */
export const TYPESCRIPT_PRESET_NAMES = ["typescript", "tsconfig"] as const

export type TypeScriptPreset = (typeof TYPESCRIPT_PRESET_NAMES)[number]

/**
 * The import that `extends` names for each TypeScript preset.
 */
export const TYPESCRIPT_PRESETS = {
  tsconfig: publicImport("./tsconfig"),
  typescript: publicImport("./typescript"),
} as const satisfies Record<TypeScriptPreset, string>

const PRESET_IMPORTS: readonly string[] = Object.values(TYPESCRIPT_PRESETS)

export function getMonorepoGuidance(preset: TypeScriptPreset) {
  const guidance = [
    "Adamantite leaves the root `tsconfig.json` unchanged in a monorepo.",
    `Add \`"extends": "${TYPESCRIPT_PRESETS[preset]}"\` to each package's \`tsconfig.json\` or to a shared base config.`,
  ]

  if (preset === "typescript") {
    guidance.push(`In a library package, extend \`${TYPESCRIPT_PRESETS.tsconfig}\` instead.`)
  }

  return guidance
}

// Later entries in an `extends` array override earlier ones, so the preset is appended last when
// Adamantite adds it. An array that already contains the preset is kept in the user's order, even
// when the preset is not last. The other Adamantite preset is removed, because a config extends
// one of them.
function mergeExtends(existing: JsonValue | undefined, preset: TypeScriptPreset) {
  const presetImport = TYPESCRIPT_PRESETS[preset]

  if (Predicate.isString(existing)) {
    if (existing === presetImport || PRESET_IMPORTS.includes(existing)) {
      return presetImport
    }

    return [existing, presetImport]
  }

  if (Array.isArray(existing)) {
    const kept = existing.filter(
      (entry) =>
        entry === presetImport || !Predicate.isString(entry) || !PRESET_IMPORTS.includes(entry)
    )

    return kept.includes(presetImport) ? kept : [...kept, presetImport]
  }

  return presetImport
}

/**
 * The first of `file` and `file` with `.json` added that exists, as TypeScript looks up a config.
 */
const findConfigFile = Effect.fn("findConfigFile")(function* (file: string) {
  const fs = yield* FileSystem.FileSystem
  const candidates = file.endsWith(".json") ? [file] : [file, `${file}.json`]

  for (const candidate of candidates) {
    if (yield* fs.exists(candidate)) {
      return Option.some(candidate)
    }
  }

  return Option.none<string>()
})

/**
 * The config file that an `extends` entry names, by TypeScript's rules rather than the runtime
 * resolver's, which would pick a `.js` file or a package's `main` entry. A path is used as written,
 * then with `.json` added. A bare package name means the package's `tsconfig` field, or its
 * `tsconfig.json`. A package subpath goes through the package's exports only when they map it to a
 * `.json` file, and otherwise names a file in the package.
 */
const resolveExtends = Effect.fn("resolveExtends")(function* (
  directory: string,
  specifier: string
) {
  const path = yield* Path.Path

  if (specifier.startsWith(".") || path.isAbsolute(specifier)) {
    return yield* findConfigFile(path.resolve(directory, specifier))
  }

  const parts = specifier.split("/")
  const nameLength = specifier.startsWith("@") ? 2 : 1
  const subpath = parts.slice(nameLength).join("/")

  if (subpath !== "") {
    const resolver = yield* ModuleResolver
    const exported = yield* resolver.resolve(directory, specifier)

    if (Option.isSome(exported) && exported.value.endsWith(".json")) {
      return exported
    }
  }

  const packageDirectory = yield* resolvePackageDirectory(
    directory,
    parts.slice(0, nameLength).join("/")
  )

  if (Option.isNone(packageDirectory)) {
    return Option.none<string>()
  }

  if (subpath !== "") {
    return yield* findConfigFile(path.join(packageDirectory.value, subpath))
  }

  const manifest = yield* readPackageJson(packageDirectory.value)
  const entry = Predicate.isString(manifest.tsconfig) ? manifest.tsconfig : "tsconfig.json"

  return yield* findConfigFile(path.join(packageDirectory.value, entry))
})

/**
 * An Adamantite preset that a config reaches, and the config file that names it.
 */
interface PresetSource {
  readonly preset: TypeScriptPreset
  readonly source: string
}

/**
 * The Adamantite preset that a `tsconfig.json` reaches through `extends`, directly or through base
 * configs, and the config file that names it. `adamantite/typescript` counts when any branch of the
 * inheritance reaches it, because it adds the type resets, so the search goes on after it finds
 * `adamantite/tsconfig`.
 */
const readPreset = Effect.fn("readPreset")(function* (configPath: string) {
  const path = yield* Path.Path
  const visited = new Set<string>()
  const pending = [configPath]
  let plainSource = Option.none<string>()

  for (let current = pending.shift(); current !== undefined; current = pending.shift()) {
    if (visited.has(current)) {
      continue
    }

    visited.add(current)
    const content = yield* readFileIfExists(current)

    if (Option.isNone(content)) {
      continue
    }

    const config = yield* parseJson(content.value, current)

    if (!Predicate.isObject(config)) {
      continue
    }

    const entries = (Array.isArray(config.extends) ? config.extends : [config.extends]).filter(
      Predicate.isString
    )

    if (entries.includes(TYPESCRIPT_PRESETS.typescript)) {
      return Option.some<PresetSource>({ preset: "typescript", source: current })
    }

    if (Option.isNone(plainSource) && entries.includes(TYPESCRIPT_PRESETS.tsconfig)) {
      plainSource = Option.some(current)
    }

    for (const entry of entries.filter((name) => !PRESET_IMPORTS.includes(name))) {
      const base = yield* resolveExtends(path.dirname(current), entry)

      if (Option.isSome(base)) {
        pending.push(base.value)
      }
    }
  }

  return Option.map(plainSource, (source): PresetSource => ({ preset: "tsconfig", source }))
})

// Another project imports a package that is not private and declares `exports` or `types`, so it
// can read the declaration files that the package emits.
function checkPublishesTypes(packageJson: PackageJson) {
  return (
    packageJson.private !== true
    && (packageJson.exports !== undefined || packageJson.types !== undefined)
  )
}

/**
 * `configPath` is the library's config, and `source` is the config that names the preset: the same
 * file, or a base config that it extends.
 */
function toLibraryFinding(configPath: string, source: string): Finding {
  const reached =
    source === configPath
      ? `extends \`${TYPESCRIPT_PRESETS.typescript}\``
      : `extends \`${TYPESCRIPT_PRESETS.typescript}\` through \`${source}\``

  return {
    currentState: `\`${configPath}\` ${reached}, and its \`package.json\` is not private and declares \`exports\` or \`types\`.`,
    goal: [
      source === configPath
        ? `Replace \`${TYPESCRIPT_PRESETS.typescript}\` with \`${TYPESCRIPT_PRESETS.tsconfig}\` in the \`extends\` of \`${configPath}\`. Preserve every other setting.`
        : `Make \`${configPath}\` extend \`${TYPESCRIPT_PRESETS.tsconfig}\` instead of reaching \`${TYPESCRIPT_PRESETS.typescript}\` through \`${source}\`, such as through a base config for libraries. Keep \`${source}\` for the packages that use it, and preserve every other setting.`,
    ],
    id: "typescript-preset-in-library",
    integration: "tsconfig",
    notes: [
      `\`${TYPESCRIPT_PRESETS.typescript}\` adds the type resets. A declaration file that the library emits can name the global \`AdamantiteTypeScript\` helper types, which projects without the resets do not have.`,
    ],
    title: "Type resets in a library",
  }
}

export default defineIntegration({
  // Doctor checks only the packages that chose a preset, so a project that declined it in init
  // gets no finding. Oxlint's type check runs without a `tsconfig.json`.
  assess: ({ cwd, packageJson, workspace }: Project) =>
    Effect.gen(function* () {
      const path = yield* Path.Path

      const packages = yield* Effect.forEach([cwd, ...workspace.packageDirectories], (directory) =>
        readPreset(path.join(directory, files[0].path)).pipe(
          Effect.map((preset) => ({ directory, preset }))
        )
      )

      const configured = packages.filter(({ preset }) => Option.isSome(preset))

      if (configured.length === 0) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const findings = yield* Effect.forEach(configured, ({ directory, preset }) =>
        Option.isSome(preset) && preset.value.preset === "typescript"
          ? (directory === cwd ? Effect.succeed(packageJson) : readPackageJson(directory)).pipe(
              Effect.map((manifest) =>
                checkPublishesTypes(manifest)
                  ? [
                      toLibraryFinding(
                        path.relative(cwd, path.join(directory, files[0].path)),
                        path.relative(cwd, preset.value.source)
                      ),
                    ]
                  : []
              )
            )
          : Effect.succeed([])
      )

      return {
        applicable: true,
        findings: findings.flat(),
        packageActions: [],
        warnings: [],
      } satisfies IntegrationAssessment
    }),
  config: files[0].path,
  create: (cwd: string, preset: TypeScriptPreset) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      yield* writeJsonFile(path.join(cwd, files[0].path), { extends: TYPESCRIPT_PRESETS[preset] })
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path

      return yield* fs.exists(path.join(cwd, files[0].path))
    }),
  files,
  kind: "workspace",
  name: "tsconfig",
  update: (cwd: string, preset: TypeScriptPreset) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)

      const tsconfigFile = yield* readFile(configPath)
      const existingConfig = yield* parseJson(tsconfigFile, configPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const merged = yield* mergeConfig({
        fallback: { extends: TYPESCRIPT_PRESETS[preset] },
        preferred: existingConfig,
      })

      // Effect's JsonObject interface triggers no-misused-spread, so rebuild the plain JSON object.
      const newConfig: JsonObject = Object.fromEntries([
        ...Object.entries(merged),
        [
          "extends",
          mergeExtends("extends" in existingConfig ? existingConfig.extends : undefined, preset),
        ],
      ])

      yield* writeFile(configPath, updateJsonText(tsconfigFile, newConfig))
    }),
})
