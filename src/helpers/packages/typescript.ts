import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { FailedToReadFile, FailedToWriteFile, InvalidConfigFormat } from "#errors.ts"
import { isJsonObject, mergeConfig, parseJson } from "#utils.ts"

const CONFIG_FILE = "tsconfig.json"

export const typescript = {
  command: "tsc",
  config: { extends: "adamantite/typescript" },
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)
      const payload = JSON.stringify(typescript.config, null, 2)

      yield* fs
        .writeFileString(configPath, `${payload}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(cwd, CONFIG_FILE))
    }),
  name: "typescript",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)

      const tsconfigFile = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))
      const existingConfig = yield* parseJson(tsconfigFile, configPath)

      // Merge config: Adamantite's config takes precedence (first argument in defu)
      // This ensures Adamantite's extends is always applied
      // Empty configs are allowed and will be merged with Adamantite's config
      if (!isJsonObject(existingConfig)) {
        return yield* Effect.fail(new InvalidConfigFormat({ path: configPath }))
      }
      const newConfig = yield* mergeConfig(typescript.config, existingConfig)

      yield* fs
        .writeFileString(configPath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),

  version: "5.9.3",
}
