import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import {
  FailedToCreateDirectory,
  FailedToReadFile,
  FailedToWriteFile,
  InvalidConfigFormat,
} from "#errors.ts"
import { isJsonObject, mergeConfig, parseJson } from "#utils.ts"

const SETTINGS_FILE = "settings.json"

export const zed = {
  config: {
    languages: {
      CSS: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      HTML: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      JSON: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      JSONC: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      JavaScript: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
      },
      MDX: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      Markdown: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      TSX: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      TypeScript: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
      YAML: {
        format_on_save: "on",
        formatter: [{ language_server: { name: "oxfmt" } }],
      },
    },
    lsp: {
      oxfmt: {
        initialization_options: {
          settings: {
            configPath: null,
            "fmt.experimental": true,
            run: "onSave",
            typeAware: false,
            unusedDisableDirectives: false,
          },
        },
      },
      oxlint: {
        initialization_options: {
          settings: {
            configPath: null,
            fixKind: "safe_fix",
            run: "onType",
            typeAware: true,
            unusedDisableDirectives: "deny",
          },
        },
      },
    },
  },
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const zedPath = path.join(cwd, ".zed")
      const settingsPath = path.join(zedPath, SETTINGS_FILE)

      yield* fs
        .makeDirectory(zedPath, { recursive: true })
        .pipe(Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path: zedPath })))

      yield* fs
        .writeFileString(settingsPath, `${JSON.stringify(zed.config, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: settingsPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(cwd, ".zed", SETTINGS_FILE))
    }),
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const zedPath = path.join(cwd, ".zed", SETTINGS_FILE)

      const zedFile = yield* fs
        .readFileString(zedPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: zedPath })))

      const existingConfig = yield* parseJson(zedFile, zedPath)

      if (!isJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: zedPath })
      }

      const newConfig = yield* mergeConfig(zed.config, existingConfig)

      yield* fs
        .writeFileString(zedPath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: zedPath })))
    }),
}
