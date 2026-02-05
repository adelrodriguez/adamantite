import { FileSystem, Path } from "@effect/platform"
import { Effect } from "effect"
import { FailedToReadFile, FailedToWriteFile, FileNotFound, InvalidConfigFormat } from "#errors.ts"
import preset from "#presets/knip.json" with { type: "json" }
import { isJsonObject, mergeConfig, parseJson } from "#utils.ts"

const CONFIG_FILE_JSON = "knip.json"
const CONFIG_FILE_JSONC = "knip.jsonc"

export const knip = {
  config: preset,
  create: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(process.cwd(), CONFIG_FILE_JSON)
      const payload = JSON.stringify(knip.config, null, 2)

      yield* fs
        .writeFileString(configPath, `${payload}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const jsonPath = path.join(process.cwd(), CONFIG_FILE_JSON)
      const jsoncPath = path.join(process.cwd(), CONFIG_FILE_JSONC)

      if (yield* fs.exists(jsonPath)) {
        return { path: jsonPath }
      }

      if (yield* fs.exists(jsoncPath)) {
        return { path: jsoncPath }
      }

      return { path: null }
    }),
  name: "knip",
  update: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const { path: configPath } = yield* knip.exists()

      if (!configPath) {
        return yield* Effect.fail(new FileNotFound({ path: CONFIG_FILE_JSON }))
      }

      const knipFile = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))

      const existingConfig = yield* parseJson(knipFile, configPath)

      // Empty configs are allowed and will be merged with Adamantite's config
      // Ensure existingConfig is a JSON object (not null, array, or primitive)
      if (!isJsonObject(existingConfig)) {
        return yield* Effect.fail(new InvalidConfigFormat({ path: configPath }))
      }

      const mergedConfig = yield* mergeConfig(existingConfig, knip.config)

      // Set schema based on file extension
      const isJsonc = configPath.endsWith(".jsonc")
      mergedConfig.$schema = isJsonc
        ? "https://unpkg.com/knip@5/schema-jsonc.json"
        : "https://unpkg.com/knip@5/schema.json"

      yield* fs
        .writeFileString(configPath, `${JSON.stringify(mergedConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  version: "5.83.1",
}
