import type { oxlintPlugins } from "#lib/integrations/tooling/oxlint/plugins/index.ts"
import { defineManagedPlugin } from "#lib/integrations/tooling/oxlint/plugins/define.ts"
import { lintPresets } from "#lib/integrations/tooling/oxlint/presets.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

// The version macros need a literal package name, so each plugin has a pin here. `satisfies`
// fails for a definition without a pin, and for a pin without a definition.
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
