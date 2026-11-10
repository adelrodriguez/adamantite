import { getConfigTemplate } from "#lib/integrations/tooling/oxfmt/config.macro.ts" with { type: "macro" }
import { inspectRequiredPresetConfig } from "#lib/integrations/tooling/preset-config.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

const configTemplate = getConfigTemplate()

export function inspectRequiredOxfmtConfig(content: string) {
  return inspectRequiredPresetConfig(content, {
    moduleName: publicImport("./format"),
    presetName: "Adamantite format",
  })
}

export function toOxfmtTsConfigContent() {
  return configTemplate
}
