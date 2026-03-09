import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import {
  FailedToDeleteFile,
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  InvalidConfigFormat,
} from "#errors.ts"
import { isJsonObject, parseJson } from "#utils.ts"

const CONFIG_FILE = "oxlint.config.ts"
const LEGACY_CONFIG_FILE = ".oxlintrc.json"
const ADAMANTITE_NODE_MODULES_PRESET_REGEX =
  /^(?:\.\/)?node_modules\/adamantite\/presets\/lint\/([a-z0-9-]+)\.(?:json|ts)$/
const ADAMANTITE_EXPORT_PRESET_REGEX = /^adamantite\/lint(?:\/([a-z0-9-]+))?$/

function getPresetNames(presets: string[] = []) {
  return presets.includes("core") ? presets : ["core", ...presets]
}

function getExtendsArray(extendsValue: unknown): string[] {
  if (Array.isArray(extendsValue)) {
    return extendsValue.filter((value): value is string => typeof value === "string")
  }

  if (typeof extendsValue === "string") {
    return [extendsValue]
  }

  return []
}

function getImportName(preset: string) {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function getImportPath(preset: string) {
  return preset === "core" ? "adamantite/lint" : `adamantite/lint/${preset}`
}

function getPresetNameFromAdamantiteExtends(extendsItem: string) {
  const nodeModulesMatch = extendsItem.match(ADAMANTITE_NODE_MODULES_PRESET_REGEX)

  if (nodeModulesMatch?.[1]) {
    return nodeModulesMatch[1]
  }

  const exportMatch = extendsItem.match(ADAMANTITE_EXPORT_PRESET_REGEX)

  if (exportMatch) {
    return exportMatch[1] ?? "core"
  }

  return null
}

function formatObjectEntries(entries: Array<[string, string]>, indent: number) {
  const pad = " ".repeat(indent)
  return entries.map(([key, value]) => `${pad}${key}: ${value},`).join("\n")
}

function toTsConfigContent(
  config: Record<string, unknown>,
  presetNames: string[],
  passthroughExtends: string[] = []
) {
  const imports = [
    'import { defineConfig } from "oxlint"',
    ...presetNames.map(
      (preset) => `import ${getImportName(preset)} from "${getImportPath(preset)}"`
    ),
  ]

  const presetExtendItems = presetNames.map((preset) => getImportName(preset))
  const allExtends = [
    ...presetExtendItems,
    ...passthroughExtends.map((item) => JSON.stringify(item)),
  ]

  const entries: Array<[string, string]> = [
    ...Object.entries(config).map(
      ([key, value]) => [key, JSON.stringify(value, null, 2)] as [string, string]
    ),
    ["extends", `[${allExtends.join(", ")}]`],
  ]

  const body = formatObjectEntries(entries, 2)

  return [...imports, "", `export default defineConfig({`, body, `})`, ""].join("\n")
}

export const oxlint = {
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
      const oxlintState = yield* oxlint.exists(cwd)

      if (oxlintState.tsPath) {
        return
      }

      if (!oxlintState.jsonPath) {
        return yield* new FileNotFound({ path: LEGACY_CONFIG_FILE })
      }

      const legacyConfigPath = oxlintState.jsonPath
      const configPath = path.join(cwd, CONFIG_FILE)

      const legacyConfigContent = yield* fs
        .readFileString(legacyConfigPath)
        .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: legacyConfigPath })))

      const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

      if (!isJsonObject(existingConfig)) {
        return yield* new InvalidConfigFormat({ path: legacyConfigPath })
      }

      const { $schema: _schema, ...configWithoutSchema } = existingConfig

      const extendsArray = getExtendsArray(configWithoutSchema.extends)
      const presetNameSet = new Set(getPresetNames(presets))
      const passthroughSet = new Set<string>()

      for (const extendsItem of extendsArray) {
        const presetName = getPresetNameFromAdamantiteExtends(extendsItem)

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
  version: "1.50.0",
}

export const tsgolint = {
  name: "oxlint-tsgolint",
  version: "0.14.2",
}
