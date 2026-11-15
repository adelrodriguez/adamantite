import type { OxlintPlugin } from "#lib/integrations/oxlint/plugins/base.ts"
import effectTsgo from "#lib/integrations/oxlint/plugins/effect-tsgo/index.ts"
import reactDoctor from "#lib/integrations/oxlint/plugins/react-doctor.ts"
import tailwind from "#lib/integrations/oxlint/plugins/tailwind.ts"
import { LINT_PRESETS, type LintPreset } from "#lib/project/selection.ts"

interface LintPresetDefinition {
  /**
   * The presets that cannot be selected with this one, because they report the same defects. A
   * selection of the two gives two reports for each defect. The exclusion goes both ways, so each
   * preset lists the other.
   */
  readonly excludes?: readonly LintPreset[]
  /**
   * What the preset's rules check, for the init choice. `describeLintPreset` adds the plugin
   * package and the required presets.
   */
  readonly hint: string
  readonly label: string
  /**
   * The managed plugin that init installs, and Doctor and update maintain, for this preset.
   */
  readonly plugin?: OxlintPlugin
  /**
   * The presets that must be selected with this one.
   */
  readonly requires?: readonly LintPreset[]
}

// `satisfies` fails for a preset without a definition, and for a definition without a preset.
const definitions = {
  architecture: {
    hint: "Check the layer maps and import owners you define.",
    label: "architecture",
  },
  effect: {
    hint: "Find effects that never run.",
    label: "effect",
    plugin: effectTsgo,
  },
  jest: {
    excludes: ["vitest"],
    hint: "Find focused or skipped tests and check assertions.",
    label: "jest",
  },
  nextjs: {
    hint: "Check Next.js scripts, fonts, images, and head usage.",
    label: "next.js",
  },
  react: {
    hint: "Check React code, JSX accessibility, and performance.",
    label: "react",
  },
  "react-strict": {
    hint: "Keep state, effect, and memo hooks in hook files.",
    label: "react-strict",
    plugin: reactDoctor,
    requires: ["react"],
  },
  strict: {
    hint: "Ban type assertions, unknown parameters, module mocks, and TODOs.",
    label: "strict",
  },
  tailwind: {
    hint: "Check Tailwind v4 classes.",
    label: "tailwind",
    plugin: tailwind,
  },
  tanstack: {
    hint: "Use queryOptions() and keep query data out of state.",
    label: "tanstack",
  },
  vitest: {
    excludes: ["jest"],
    hint: "Find focused or skipped tests and check assertions.",
    label: "vitest",
  },
  vue: {
    hint: "Check Vue 3 code for errors and deprecated APIs.",
    label: "vue",
  },
} as const satisfies Record<LintPreset, LintPresetDefinition>

/**
 * Each lint preset of `LINT_PRESETS` with its definition, in the order that init offers them.
 */
export const lintPresets = LINT_PRESETS.map((name) => ({ ...definitions[name], name }))

/**
 * The init hint: what the rules check, then the package that init installs, the presets that it
 * selects, and the presets that it excludes, so the user knows what a choice adds before selecting
 * it.
 */
export function describeLintPreset(preset: LintPresetDefinition): string {
  const setup = [
    ...(preset.plugin === undefined ? [] : [`installs ${preset.plugin.name}`]),
    ...(preset.requires ?? []).map((required) => `selects the ${required} preset`),
  ].join(" and ")

  return [
    preset.hint,
    ...(setup === "" ? [] : [`${setup.charAt(0).toUpperCase()}${setup.slice(1)}.`]),
    ...(preset.excludes ?? []).map((excluded) => `Cannot be selected with the ${excluded} preset.`),
  ].join(" ")
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

/**
 * Each selected preset with a selected preset that it excludes, in the order of the catalog. Each
 * preset of an excluded pair lists the other, so the pair appears once for each preset.
 */
export function findExcludedPresets(
  selected: readonly string[]
): ReadonlyArray<{ readonly excluded: LintPreset; readonly preset: LintPreset }> {
  return lintPresets.flatMap((preset) =>
    selected.includes(preset.name) && "excludes" in preset
      ? preset.excludes
          .filter((excluded) => selected.includes(excluded))
          .map((excluded) => ({ excluded, preset: preset.name }))
      : []
  )
}
