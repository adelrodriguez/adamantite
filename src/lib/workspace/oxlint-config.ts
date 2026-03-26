import { isJsonObject } from "#lib/shared/json.ts"

export function getOxlintPresetNames(presets: string[] = []) {
  return presets.includes("core") ? presets : ["core", ...presets]
}

function getImportName(preset: string) {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function toOxlintTsConfigContent(
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

  return [...imports, "", "export default defineConfig({", body, "})", ""].join("\n")
}
