import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { defineIntegration } from "#lib/integrations/base.ts"
import {
  FailedToCreateDirectory,
  FailedToReadFile,
  FailedToWriteFile,
  InvalidConfigFormat,
} from "#lib/shared/errors.ts"
import { mergeConfig, parseJson } from "#lib/shared/json.ts"

const files = [{ path: ".zed/settings.json", type: "config" }] as const
const CONFIG = {
  languages: {
    CSS: { format_on_save: "on", formatter: [{ language_server: { name: "oxfmt" } }] },
    HTML: { format_on_save: "on", formatter: [{ language_server: { name: "oxfmt" } }] },
    JSON: { format_on_save: "on", formatter: [{ language_server: { name: "oxfmt" } }] },
    JSONC: { format_on_save: "on", formatter: [{ language_server: { name: "oxfmt" } }] },
    JavaScript: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
    },
    MDX: { format_on_save: "on", formatter: [{ language_server: { name: "oxfmt" } }] },
    Markdown: { format_on_save: "on", formatter: [{ language_server: { name: "oxfmt" } }] },
    TSX: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
    },
    TypeScript: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
    },
    YAML: { format_on_save: "on", formatter: [{ language_server: { name: "oxfmt" } }] },
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
} as const

function deduplicateManagedFormatters(config: Schema.JsonObject): Schema.JsonObject {
  const languageSettings = config.languages

  if (!Schema.is(Schema.Record(Schema.String, Schema.Json))(languageSettings)) {
    return config
  }

  const languages = Object.fromEntries(
    Object.entries(languageSettings).map(([language, languageConfig]) => {
      if (
        language in CONFIG.languages &&
        Schema.is(Schema.Record(Schema.String, Schema.Json))(languageConfig) &&
        Schema.is(Schema.Array(Schema.Json))(languageConfig.formatter)
      ) {
        return [
          language,
          Object.fromEntries([
            ...Object.entries(languageConfig),
            ["formatter", Array.dedupe(languageConfig.formatter)],
          ]),
        ]
      }

      return [language, languageConfig]
    })
  )

  return { ...config, languages }
}

export default defineIntegration({
  config: files[0].path,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)
      const settingsDir = path.dirname(settingsPath)

      yield* fs
        .makeDirectory(settingsDir, { recursive: true })
        .pipe(Effect.mapError((cause) => new FailedToCreateDirectory({ cause, path: settingsDir })))

      yield* fs
        .writeFileString(settingsPath, `${JSON.stringify(CONFIG, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: settingsPath })))
    }),
  detect: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      return yield* fs.exists(path.join(cwd, files[0].path))
    }),
  files,
  kind: "editor",
  name: "zed",
  update: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)

      const zedFile = yield* fs
        .readFileString(settingsPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: settingsPath })))

      const existingConfig = yield* parseJson(zedFile, settingsPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      const mergedConfig = yield* mergeConfig(CONFIG, existingConfig)
      const newConfig = deduplicateManagedFormatters(mergedConfig)

      yield* fs
        .writeFileString(settingsPath, `${JSON.stringify(newConfig, null, 2)}\n`)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: settingsPath })))
    }),
})
