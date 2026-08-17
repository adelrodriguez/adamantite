import type { JsonValue } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import { defineIntegration } from "#lib/integrations/base.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { readFile, writeJsonFile } from "#lib/shared/filesystem.ts"
import { mergeConfig, parseJson } from "#lib/shared/json.ts"

const files = [{ path: "tsconfig.json", type: "config" }] as const
const PRESET_EXTENDS = "adamantite/typescript"
const CONFIG = { extends: PRESET_EXTENDS }

export const MONOREPO_GUIDANCE = [
  "Skipping `tsconfig.json` setup: a root config in a monorepo makes TypeScript treat all packages as one project.",
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

export default defineIntegration({
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

      const merged = yield* mergeConfig(CONFIG, existingConfig)
      const newConfig = {
        ...merged,
        extends: mergeExtends("extends" in existingConfig ? existingConfig.extends : undefined),
      }

      yield* writeJsonFile(configPath, newConfig)
    }),
})
