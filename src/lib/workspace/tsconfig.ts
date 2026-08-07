import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import { defineIntegration } from "#lib/integrations/base.ts"
import { FailedToReadFile, FailedToWriteFile, InvalidConfigFormat } from "#lib/shared/errors.ts"
import { mergeConfig, parseJson } from "#lib/shared/json.ts"

const files = [{ path: "tsconfig.json", type: "config" }] as const
const CONFIG = { extends: "adamantite/typescript" }

export default defineIntegration({
  config: files[0].path,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)
      const payload = JSON.stringify(CONFIG, null, 2)

      yield* fs
        .writeFileString(configPath, `${payload}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
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
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, files[0].path)

      const tsconfigFile = yield* fs
        .readFileString(configPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))
      const existingConfig = yield* parseJson(tsconfigFile, configPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: configPath })
      }

      const newConfig = yield* mergeConfig(CONFIG, existingConfig)

      yield* fs
        .writeFileString(configPath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
})
