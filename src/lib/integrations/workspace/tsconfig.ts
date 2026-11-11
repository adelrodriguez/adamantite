import type { JsonObject, JsonValue } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { Project } from "#lib/workspace/project.ts"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { readFile, readFileIfExists, writeFile, writeJsonFile } from "#lib/shared/filesystem.ts"
import { mergeConfig, parseJson, updateJsonText } from "#lib/shared/json.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

const files = [{ path: "tsconfig.json", type: "config" }] as const
const PRESET_EXTENDS = publicImport("./typescript")
const CONFIG = { extends: PRESET_EXTENDS }

export const MONOREPO_GUIDANCE = [
  "Adamantite leaves the root `tsconfig.json` unchanged in a monorepo.",
  `To use the TypeScript preset, add \`"extends": "${PRESET_EXTENDS}"\` to each package's \`tsconfig.json\` or to a shared base config.`,
] as const

// Later entries in an `extends` array override earlier ones, so the preset is
// appended last when Adamantite adds it. An array that already contains the
// preset is kept in the user's order, even when the preset is not last.
function mergeExtends(existing: JsonValue | undefined) {
  if (Predicate.isString(existing)) {
    return existing === PRESET_EXTENDS ? existing : [existing, PRESET_EXTENDS]
  }

  if (Array.isArray(existing)) {
    return existing.includes(PRESET_EXTENDS) ? existing : [...existing, PRESET_EXTENDS]
  }

  return PRESET_EXTENDS
}

// Doctor checks only a project that chose the preset, so a project that declined it in init gets
// no finding. Oxlint's type check runs without a `tsconfig.json`.
function checkExtendsPreset(config: JsonValue) {
  return (
    Predicate.isObject(config)
    && (config.extends === PRESET_EXTENDS
      || (Array.isArray(config.extends) && config.extends.includes(PRESET_EXTENDS)))
  )
}

export default defineIntegration({
  assess: ({ cwd }: Project) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)
      const content = yield* readFileIfExists(configPath)

      if (Option.isNone(content)) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      if (!checkExtendsPreset(yield* parseJson(content.value, configPath))) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      return {
        applicable: true,
        findings: [],
        packageActions: [],
        warnings: [],
      } satisfies IntegrationAssessment
    }),
  config: files[0].path,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      yield* writeJsonFile(path.join(cwd, files[0].path), CONFIG)
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
  update: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)

      const tsconfigFile = yield* readFile(configPath)
      const existingConfig = yield* parseJson(tsconfigFile, configPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const merged = yield* mergeConfig({ fallback: CONFIG, preferred: existingConfig })

      // Effect's JsonObject interface triggers no-misused-spread, so rebuild the plain JSON object.
      const newConfig: JsonObject = Object.fromEntries([
        ...Object.entries(merged),
        ["extends", mergeExtends("extends" in existingConfig ? existingConfig.extends : undefined)],
      ])

      yield* writeFile(configPath, updateJsonText(tsconfigFile, newConfig))
    }),
})
