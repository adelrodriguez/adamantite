import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import {
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  InvalidConfigFormat,
} from "#lib/shared/errors.ts"
import { isJsonObject, mergeConfig, parseJson } from "#lib/shared/json.ts"
import preset from "#presets/format.json" with { type: "json" }

const CONFIG_FILE_JSONC = ".oxfmtrc.jsonc"
const CONFIG_FILE_JSON = ".oxfmtrc.json"

export const oxfmt = {
  config: {
    ...preset,
    $schema: "./node_modules/oxfmt/configuration_schema.json",
  },
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE_JSONC)
      const payload = JSON.stringify(oxfmt.config, null, 2)

      yield* fs
        .writeFileString(configPath, `${payload}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const jsoncPath = path.join(cwd, CONFIG_FILE_JSONC)
      const jsonPath = path.join(cwd, CONFIG_FILE_JSON)

      if (yield* fs.exists(jsoncPath)) {
        return { path: jsoncPath }
      }

      if (yield* fs.exists(jsonPath)) {
        return { path: jsonPath }
      }

      return { path: null }
    }),
  name: "oxfmt",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const { path: configPath } = yield* oxfmt.exists(cwd)

      if (!configPath) {
        return yield* new FileNotFound({ path: CONFIG_FILE_JSONC })
      }

      const oxfmtFile = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))

      const existingConfig = yield* parseJson(oxfmtFile, configPath)

      // Empty configs are allowed and will be merged with Adamantite's config
      if (!isJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const mergedConfig = yield* mergeConfig(existingConfig, oxfmt.config)
      mergedConfig.$schema = oxfmt.config.$schema

      yield* fs
        .writeFileString(configPath, `${JSON.stringify(mergedConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  version: "0.40.0",
}
