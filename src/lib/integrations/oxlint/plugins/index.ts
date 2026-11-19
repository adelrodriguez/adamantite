import { lintPresets } from "#lib/integrations/oxlint/presets.ts"

export const oxlintPlugins = lintPresets.flatMap((preset) =>
  "plugin" in preset ? [preset.plugin] : []
)
