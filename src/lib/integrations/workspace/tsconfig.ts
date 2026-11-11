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
import { readPackageJson } from "#lib/workspace/package-json.ts"

const files = [{ path: "tsconfig.json", type: "config" }] as const

/**
 * The values of `--typescript`. `typescript` adds the vendored ts-reset types to the strict options
 * of `tsconfig`, so a config that extends both counts as `typescript`.
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
 * The Adamantite preset that a `tsconfig.json` extends, if any.
 */
const readPreset = Effect.fn("readPreset")(function* (configPath: string) {
  const content = yield* readFileIfExists(configPath)

  if (Option.isNone(content)) {
    return Option.none<TypeScriptPreset>()
  }

  const config = yield* parseJson(content.value, configPath)

  if (!Predicate.isObject(config)) {
    return Option.none<TypeScriptPreset>()
  }

  const entries: readonly JsonValue[] = Array.isArray(config.extends)
    ? config.extends
    : [config.extends ?? null]

  return Array.findFirst(TYPESCRIPT_PRESET_NAMES, (preset) =>
    entries.includes(TYPESCRIPT_PRESETS[preset])
  )
})

// Another project imports a package that is not private and declares `exports` or `types`, so it
// can read the declaration files that the package emits.
function checkPublishesTypes(packageJson: PackageJson) {
  return (
    packageJson.private !== true
    && (packageJson.exports !== undefined || packageJson.types !== undefined)
  )
}

function toLibraryFinding(configPath: string): Finding {
  return {
    currentState: `\`${configPath}\` extends \`${TYPESCRIPT_PRESETS.typescript}\`, and its \`package.json\` is not private and declares \`exports\` or \`types\`.`,
    goal: [
      `Replace \`${TYPESCRIPT_PRESETS.typescript}\` with \`${TYPESCRIPT_PRESETS.tsconfig}\` in the \`extends\` of \`${configPath}\`. Preserve every other setting.`,
    ],
    id: "typescript-preset-in-library",
    integration: "tsconfig",
    notes: [
      `\`${TYPESCRIPT_PRESETS.typescript}\` adds the ts-reset types. A declaration file that the library emits can name the global \`TSReset\` helper types, which projects without ts-reset do not have.`,
    ],
    title: "ts-reset types in a library",
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

      const findings = yield* Effect.forEach(
        configured.filter(({ preset }) => Option.contains(preset, "typescript")),
        ({ directory }) =>
          (directory === cwd ? Effect.succeed(packageJson) : readPackageJson(directory)).pipe(
            Effect.map((manifest) =>
              checkPublishesTypes(manifest)
                ? [toLibraryFinding(path.relative(cwd, path.join(directory, files[0].path)))]
                : []
            )
          )
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
