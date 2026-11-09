import type { OxlintPlugin } from "#lib/integrations/tooling/oxlint/plugins/base.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/index.ts"
import reactDoctor from "#lib/integrations/tooling/oxlint/plugins/react-doctor.ts"
import tailwind from "#lib/integrations/tooling/oxlint/plugins/tailwind.ts"

interface LintPresetDefinition {
  /**
   * What the preset's rules check, for the init choice. `describeLintPreset` adds the plugin
   * package and the required presets.
   */
  readonly hint: string
  readonly label: string
  /**
   * The published module is `adamantite/lint/<name>`.
   */
  readonly name: string
  /**
   * The managed plugin that init installs, and Doctor and update maintain, for this preset.
   */
  readonly plugin?: OxlintPlugin
  /**
   * The presets that must be selected with this one.
   */
  readonly requires?: readonly string[]
}

/**
 * Every lint preset a target project can select besides core, in the order that init offers them.
 * Each one is published as `adamantite/lint/<name>`.
 */
export const lintPresets = [
  {
    hint: "Check React code, JSX accessibility, and performance.",
    label: "react",
    name: "react",
  },
  {
    hint: "Keep state, effect, and memo hooks in hook files.",
    label: "react-strict",
    name: "react-strict",
    plugin: reactDoctor,
    requires: ["react"],
  },
  {
    hint: "Use queryOptions() and keep query data out of state.",
    label: "tanstack",
    name: "tanstack",
  },
  {
    hint: "Check Next.js scripts, fonts, images, and head usage.",
    label: "next.js",
    name: "nextjs",
  },
  {
    hint: "Check Vue 3 code for errors and deprecated APIs.",
    label: "vue",
    name: "vue",
  },
  {
    hint: "Find effects that never run.",
    label: "effect",
    name: "effect",
    plugin: effectTsgo,
  },
  {
    hint: "Find focused or skipped tests and check assertions.",
    label: "jest",
    name: "jest",
  },
  {
    hint: "Find focused or skipped tests and check assertions.",
    label: "vitest",
    name: "vitest",
  },
  {
    hint: "Check Node.js callbacks and CommonJS modules.",
    label: "node",
    name: "node",
  },
  {
    hint: "Check the layer maps and import owners you define.",
    label: "architecture",
    name: "architecture",
  },
  {
    hint: "Ban type assertions, unknown parameters, module mocks, and TODOs.",
    label: "strict",
    name: "strict",
  },
  {
    hint: "Check Tailwind v4 classes.",
    label: "tailwind",
    name: "tailwind",
    plugin: tailwind,
  },
] as const satisfies readonly LintPresetDefinition[]

export type LintPreset = (typeof lintPresets)[number]["name"]

export const LINT_PRESETS = lintPresets.map((preset) => preset.name)

/**
 * Presets that Adamantite no longer publishes, in the order that Doctor reports them.
 */
export const RETIRED_LINT_PRESETS = ["shadcn", "react-doctor", "antislop"] as const

export type RetiredLintPreset = (typeof RETIRED_LINT_PRESETS)[number]

/**
 * The init hint: what the rules check, then the package that init installs and the presets that it
 * selects, so the user knows what a choice adds before selecting it.
 */
export function describeLintPreset(preset: LintPresetDefinition): string {
  const setup = [
    ...(preset.plugin === undefined ? [] : [`installs ${preset.plugin.name}`]),
    ...(preset.requires ?? []).map((required) => `selects the ${required} preset`),
  ].join(" and ")

  return setup === ""
    ? preset.hint
    : `${preset.hint} ${setup.charAt(0).toUpperCase()}${setup.slice(1)}.`
}

/**
 * Each preset that a selected preset requires but the selection lacks.
 */
export function findMissingRequiredPresets(
  selected: readonly LintPreset[]
): ReadonlyArray<{ readonly required: LintPreset; readonly requiredBy: LintPreset }> {
  return lintPresets.flatMap((preset) =>
    selected.includes(preset.name) && "requires" in preset
      ? preset.requires
          .filter((required) => !selected.includes(required))
          .map((required) => ({ required, requiredBy: preset.name }))
      : []
  )
}
