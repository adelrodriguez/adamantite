import * as FileSystem from "@effect/platform/FileSystem"
import * as Path from "@effect/platform/Path"
import * as Effect from "effect/Effect"
import { FailedToReadFile, FailedToWriteFile, FileNotFound, InvalidConfigFormat } from "#errors.ts"
import { isJsonObject, mergeConfig, parseJson } from "#utils.ts"

const CONFIG_FILE = ".oxlintrc.json"

export const oxlint = {
  config: {
    // Ensures that the schema always matches the installed version of oxlint
    $schema: "./node_modules/oxlint/configuration_schema.json",
  },
  create: (presets: string[] = []) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const extendsArray = ["./node_modules/adamantite/presets/lint/core.json"]
      for (const preset of presets) {
        extendsArray.push(`./node_modules/adamantite/presets/lint/${preset}.json`)
      }

      const configPath = path.join(process.cwd(), CONFIG_FILE)
      const payload = JSON.stringify({ ...oxlint.config, extends: extendsArray }, null, 2)

      yield* fs
        .writeFileString(configPath, `${payload}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(process.cwd(), CONFIG_FILE)
      const exists = yield* fs.exists(configPath)

      return { path: exists ? configPath : null }
    }),
  name: "oxlint",
  update: (presets: string[] = []) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const { path: configPath } = yield* oxlint.exists()

      if (!configPath) {
        return yield* Effect.fail(new FileNotFound({ path: CONFIG_FILE }))
      }

      const oxlintFile = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))

      const existingConfig = yield* parseJson(oxlintFile, configPath)

      // Empty configs are allowed and will be merged with Adamantite's config
      // Ensure existingConfig is a JSON object (not null, array, or primitive)
      if (!isJsonObject(existingConfig)) {
        return yield* Effect.fail(new InvalidConfigFormat({ path: configPath }))
      }

      const newConfig: Record<string, unknown> = { ...existingConfig }

      const extendsArray: string[] = Array.isArray(newConfig.extends)
        ? newConfig.extends
        : typeof newConfig.extends === "string"
          ? [newConfig.extends]
          : []

      // Ensure core preset is always present
      const corePath = "./node_modules/adamantite/presets/lint/core.json"
      if (!extendsArray.includes(corePath)) {
        extendsArray.unshift(corePath)
      }

      // Add selected presets, avoiding duplicates
      for (const preset of presets) {
        const presetPath = `./node_modules/adamantite/presets/lint/${preset}.json`
        if (!extendsArray.includes(presetPath)) {
          extendsArray.push(presetPath)
        }
      }

      newConfig.extends = extendsArray

      const mergedConfig = yield* mergeConfig(newConfig, oxlint.config)
      mergedConfig.$schema = oxlint.config.$schema

      yield* fs
        .writeFileString(configPath, `${JSON.stringify(mergedConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  version: "1.49.0",
}

export const tsgolint = {
  name: "oxlint-tsgolint",
  version: "0.14.1",
}
