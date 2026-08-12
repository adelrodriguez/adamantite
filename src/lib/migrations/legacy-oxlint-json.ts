import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { defineLegacyJsonConfigMigration } from "#lib/migrations/legacy-json-config.ts"
import { getOxlintPresetNames, toOxlintTsConfigContent } from "#lib/workspace/oxlint-config.ts"

const NODE_MODULES_PRESET_REGEX =
  /^(?:\.\/)?node_modules\/adamantite\/presets\/lint\/([a-z0-9-]+)\.(?:json|ts)$/
const EXPORT_PRESET_REGEX = /^adamantite\/lint(?:\/([a-z0-9-]+))?$/

/**
 * Split the legacy `extends` entries into Adamantite preset names and passthrough entries that
 * Adamantite does not recognize.
 */
function serializeLegacyOxlintConfig(config: Record<string, unknown>) {
  const extendsArray = Array.isArray(config.extends)
    ? config.extends.filter((value): value is string => typeof value === "string")
    : typeof config.extends === "string"
      ? [config.extends]
      : []
  const presetNameSet = new Set(getOxlintPresetNames())
  const passthroughSet = new Set<string>()

  for (const extendsItem of extendsArray) {
    const nodeModulesMatch = extendsItem.match(NODE_MODULES_PRESET_REGEX)
    const exportMatch = extendsItem.match(EXPORT_PRESET_REGEX)
    const presetName = nodeModulesMatch?.[1] ?? (exportMatch ? (exportMatch[1] ?? "core") : null)

    if (presetName) {
      presetNameSet.add(presetName)
    } else {
      passthroughSet.add(extendsItem)
    }
  }

  const { extends: _extends, ...configWithoutExtends } = config

  return toOxlintTsConfigContent(configWithoutExtends, [...presetNameSet], [...passthroughSet])
}

export default defineLegacyJsonConfigMigration({
  displayName: "Oxlint",
  id: "legacy-oxlint-json",
  integration: oxlint,
  serialize: serializeLegacyOxlintConfig,
  title: "Legacy oxlint JSON config",
})
