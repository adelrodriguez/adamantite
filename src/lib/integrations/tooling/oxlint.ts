import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { defineTooling } from "#lib/integrations/tooling/base.ts"
import {
  FailedToDeleteFile,
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  InvalidConfigFormat,
} from "#lib/shared/errors.ts"
import { isJsonObject, parseJson } from "#lib/shared/json.ts"

const CONFIG_FILE = "oxlint.config.ts"
const LEGACY_CONFIG_FILE = ".oxlintrc.json"
const ADAMANTITE_NODE_MODULES_PRESET_REGEX =
  /^(?:\.\/)?node_modules\/adamantite\/presets\/lint\/([a-z0-9-]+)\.(?:json|ts)$/
const ADAMANTITE_EXPORT_PRESET_REGEX = /^adamantite\/lint(?:\/([a-z0-9-]+))?$/

function getPresetNames(presets: string[] = []) {
  return presets.includes("core") ? presets : ["core", ...presets]
}

function getImportName(preset: string) {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toTsConfigContent(
  config: Record<string, unknown>,
  presetNames: string[],
  passthroughExtends: string[] = []
) {
  const { options, ...configWithoutOptions } = config
  const imports = [
    'import { defineConfig } from "oxlint"',
    ...presetNames.map(
      (preset) =>
        `import ${getImportName(preset)} from "${preset === "core" ? "adamantite/lint" : `adamantite/lint/${preset}`}"`
    ),
  ]

  const presetExtendItems = presetNames.map((preset) => getImportName(preset))
  const allExtends = [
    ...presetExtendItems,
    ...passthroughExtends.map((item) => JSON.stringify(item)),
  ]

  const serializedOptions = JSON.stringify(
    isJsonObject(options)
      ? {
          ...options,
          typeAware: true,
          typeCheck: true,
        }
      : {
          typeAware: true,
          typeCheck: true,
        },
    null,
    2
  )
  const serializedConfigEntries = Object.entries(configWithoutOptions).map(
    ([key, value]) => [key, JSON.stringify(value, null, 2)] as [string, string]
  )
  const serializedExtends = `[${allExtends.join(", ")}]`
  const body = [
    ["options", serializedOptions],
    ...serializedConfigEntries,
    ["extends", serializedExtends],
  ]
    .map(([key, value]) => `  ${key}: ${value},`)
    .join("\n")

  return [...imports, "", `export default defineConfig({`, body, `})`, ""].join("\n")
}

export const oxlint = defineTooling({
  create: (cwd: string, presets: string[] = []) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const configPath = path.join(cwd, CONFIG_FILE)
      const payload = toTsConfigContent({}, getPresetNames(presets))

      yield* fs
        .writeFileString(configPath, payload)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))
    }),
  exists: (cwd: string) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tsPath = path.join(cwd, CONFIG_FILE)
      const jsonPath = path.join(cwd, LEGACY_CONFIG_FILE)
      const hasTs = yield* fs.exists(tsPath)
      const hasJson = yield* fs.exists(jsonPath)

      const format: "json" | "ts" | null = hasTs ? "ts" : hasJson ? "json" : null
      const activePath = format === "ts" ? tsPath : format === "json" ? jsonPath : null

      return {
        format,
        hasBoth: hasTs && hasJson,
        jsonPath: hasJson ? jsonPath : null,
        path: activePath,
        tsPath: hasTs ? tsPath : null,
      }
    }),
  name: "oxlint",
  update: (cwd: string, presets: string[] = []) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const path = yield* Path.Path
      const tsPath = path.join(cwd, CONFIG_FILE)
      const jsonPath = path.join(cwd, LEGACY_CONFIG_FILE)
      const hasTs = yield* fs.exists(tsPath)
      const hasJson = yield* fs.exists(jsonPath)

      if (hasTs) {
        return
      }

      if (!hasJson) {
        return yield* new FileNotFound({ path: LEGACY_CONFIG_FILE })
      }

      const legacyConfigPath = jsonPath
      const configPath = path.join(cwd, CONFIG_FILE)

      const legacyConfigContent = yield* fs
        .readFileString(legacyConfigPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: legacyConfigPath })))

      const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

      if (!isJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: legacyConfigPath })
      }

      const { $schema: _schema, ...configWithoutSchema } = existingConfig

      const extendsArray = Array.isArray(configWithoutSchema.extends)
        ? configWithoutSchema.extends.filter((value): value is string => typeof value === "string")
        : typeof configWithoutSchema.extends === "string"
          ? [configWithoutSchema.extends]
          : []
      const presetNameSet = new Set(getPresetNames(presets))
      const passthroughSet = new Set<string>()

      for (const extendsItem of extendsArray) {
        const nodeModulesMatch = extendsItem.match(ADAMANTITE_NODE_MODULES_PRESET_REGEX)
        const exportMatch = extendsItem.match(ADAMANTITE_EXPORT_PRESET_REGEX)
        const presetName =
          nodeModulesMatch?.[1] ?? (exportMatch ? (exportMatch[1] ?? "core") : null)

        if (presetName) {
          presetNameSet.add(presetName)
        } else {
          passthroughSet.add(extendsItem)
        }
      }

      const { extends: _extends, ...configWithoutExtends } = configWithoutSchema

      yield* fs
        .writeFileString(
          configPath,
          toTsConfigContent(configWithoutExtends, [...presetNameSet], [...passthroughSet])
        )
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))

      yield* fs
        .remove(legacyConfigPath)
        .pipe(Effect.mapError((cause) => new FailedToDeleteFile({ cause, path: legacyConfigPath })))
    }),
  version: "1.55.0",
})

export const tsgolint = defineTooling({
  name: "oxlint-tsgolint",
  version: "0.17.0",
})
