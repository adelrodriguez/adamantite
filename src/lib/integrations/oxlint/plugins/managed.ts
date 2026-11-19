import type { oxlintPlugins } from "#lib/integrations/oxlint/plugins/index.ts"
import { defineManagedPlugin } from "#lib/integrations/oxlint/plugins/define.ts"
import { lintPresets } from "#lib/integrations/oxlint/presets.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

// A version macro needs a literal package name, so each plugin has a pin here.
const versions = {
  "@effect/tsgo": getDependencyVersion("@effect/tsgo"),
  "@shadcn/lint": getDependencyVersion("@shadcn/lint"),
  "oxlint-plugin-react-doctor": getDependencyVersion("oxlint-plugin-react-doctor"),
} satisfies Record<(typeof oxlintPlugins)[number]["name"], string>

export const managedPlugins = lintPresets.flatMap((preset) =>
  "plugin" in preset
    ? [
        defineManagedPlugin({
          ...preset.plugin,
          preset: preset.name,
          version: versions[preset.plugin.name],
        }),
      ]
    : []
)
