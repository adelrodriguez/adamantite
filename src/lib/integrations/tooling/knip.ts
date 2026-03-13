import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineTooling } from "#lib/integrations/tooling/base.ts"
import {
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  InvalidConfigFormat,
} from "#lib/shared/errors.ts"
import { isJsonObject, mergeConfig, parseJson } from "#lib/shared/json.ts"
import preset from "#presets/knip.json" with { type: "json" }

const CONFIG_FILE_JSON = "knip.json"
const CONFIG_FILE_JSONC = "knip.jsonc"

export const knip = defineTooling({
  config: preset,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE_JSON)
      const payload = JSON.stringify(preset, null, 2)

      yield* fs
        .writeFileString(configPath, `${payload}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const jsonPath = path.join(cwd, CONFIG_FILE_JSON)
      const jsoncPath = path.join(cwd, CONFIG_FILE_JSONC)

      if (yield* fs.exists(jsonPath)) {
        return { path: jsonPath }
      }

      if (yield* fs.exists(jsoncPath)) {
        return { path: jsoncPath }
      }

      return { path: null }
    }),
  name: "knip",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const jsonPath = path.join(cwd, CONFIG_FILE_JSON)
      const jsoncPath = path.join(cwd, CONFIG_FILE_JSONC)
      const configPath = (yield* fs.exists(jsonPath))
        ? jsonPath
        : (yield* fs.exists(jsoncPath))
          ? jsoncPath
          : null

      if (!configPath) {
        return yield* new FileNotFound({ path: CONFIG_FILE_JSON })
      }

      const knipFile = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))

      const existingConfig = yield* parseJson(knipFile, configPath)

      // Empty configs are allowed and will be merged with Adamantite's config
      // Ensure existingConfig is a JSON object (not null, array, or primitive)
      if (!isJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const mergedConfig = yield* mergeConfig(existingConfig, preset)

      // Set schema based on file extension
      const isJsonc = configPath.endsWith(".jsonc")
      mergedConfig.$schema = isJsonc
        ? "https://unpkg.com/knip@5/schema-jsonc.json"
        : "https://unpkg.com/knip@5/schema.json"

      yield* fs
        .writeFileString(configPath, `${JSON.stringify(mergedConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  version: "5.86.0",
})
