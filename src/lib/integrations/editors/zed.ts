import type * as Schema from "effect/Schema"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import { defineIntegration } from "#lib/integrations/base.ts"
import { InvalidConfigFormat } from "#lib/shared/errors.ts"
import { ensureDirectory, readFile, writeJsonFile } from "#lib/shared/filesystem.ts"
import { checkIsJsonArray, checkIsJsonObject, mergeConfig, parseJson } from "#lib/shared/json.ts"

const files = [{ path: ".zed/settings.json", type: "config" }] as const
const CONFIG = {
  languages: {
    // oxfmt cannot format Astro files, so they go to Zed's managed Prettier, which installs the
    // listed plugins itself and keeps the project free of Prettier dependencies. Mirrors Zed's
    // shipped default for Astro: no `formatter` key, so the default "auto" formatter picks
    // Prettier via `allowed`, and no `parser`, which the plugin infers.
    Astro: {
      format_on_save: "on",
      prettier: { allowed: true, plugins: ["prettier-plugin-astro"] },
    },
    CSS: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    HTML: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    JSON: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    JSONC: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    JavaScript: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
      prettier: { allowed: false },
    },
    MDX: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    Markdown: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
    TSX: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
      prettier: { allowed: false },
    },
    TypeScript: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }, { code_action: "source.fixAll.oxc" }],
      prettier: { allowed: false },
    },
    YAML: {
      format_on_save: "on",
      formatter: [{ language_server: { name: "oxfmt" } }],
      prettier: { allowed: false },
    },
  },
  lsp: {
    oxfmt: {
      initialization_options: {
        settings: {
          "fmt.configPath": null,
          run: "onSave",
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

function deduplicatePrettierPlugins(prettierConfig: Schema.Json) {
  if (!checkIsJsonObject(prettierConfig) || !checkIsJsonArray(prettierConfig.plugins)) {
    return prettierConfig
  }

  return Object.fromEntries([
    ...Object.entries(prettierConfig),
    ["plugins", Array.dedupe(prettierConfig.plugins)],
  ])
}

// The merge concatenates preset and user arrays, so managed languages dedupe their `formatter`
// and `prettier.plugins` arrays to keep repeated updates idempotent.
function deduplicateManagedFormatters(config: Schema.JsonObject): Schema.JsonObject {
  const languageSettings = config.languages

  if (!checkIsJsonObject(languageSettings)) {
    return config
  }

  const languages = Object.fromEntries(
    Object.entries(languageSettings).map(([language, languageConfig]) => {
      if (!(language in CONFIG.languages) || !checkIsJsonObject(languageConfig)) {
        return [language, languageConfig]
      }

      return [
        language,
        Object.fromEntries(
          Object.entries(languageConfig).map(([key, value]) => {
            if (key === "formatter" && checkIsJsonArray(value)) {
              return [key, Array.dedupe(value)]
            }

            if (key === "prettier") {
              return [key, deduplicatePrettierPlugins(value)]
            }

            return [key, value]
          })
        ),
      ]
    })
  )

  return { ...config, languages }
}

export default defineIntegration({
  config: files[0].path,
  create: (cwd: string) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)

      yield* ensureDirectory(path.dirname(settingsPath))
      yield* writeJsonFile(settingsPath, CONFIG)
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
      const path = yield* Path.Path
      const settingsPath = path.join(cwd, files[0].path)

      const zedFile = yield* readFile(settingsPath)
      const existingConfig = yield* parseJson(zedFile, settingsPath)

      if (!Predicate.isObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: settingsPath })
      }

      const mergedConfig = yield* mergeConfig(CONFIG, existingConfig)
      const newConfig = deduplicateManagedFormatters(mergedConfig)

      yield* writeJsonFile(settingsPath, newConfig)
    }),
})
