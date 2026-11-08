import { lintPresets } from "#lib/integrations/tooling/oxlint/presets.ts"

/**
 * Every Oxlint plugin definition, from the presets that load them. Both runtime resolution and
 * management use this registry. The Oxlint entry loads it from source, so no definition imports a
 * macro module. `plugins/managed.ts` adds the versions.
 */
export const oxlintPlugins = lintPresets.flatMap((preset) =>
  "plugin" in preset ? [preset.plugin] : []
)
