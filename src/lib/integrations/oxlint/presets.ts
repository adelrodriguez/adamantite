import type { OxlintConfig } from "oxlint"
import type { OxlintPlugin } from "#lib/integrations/oxlint/plugins/base.ts"
import effectTsgo from "#lib/integrations/oxlint/plugins/effect-tsgo/index.ts"
import reactDoctor from "#lib/integrations/oxlint/plugins/react-doctor.ts"
import tailwind from "#lib/integrations/oxlint/plugins/tailwind.ts"
import { LINT_PRESETS, type LintPreset } from "#lib/project/selection.ts"
import architecturePreset from "#presets/lint/architecture.ts"
import effectPreset from "#presets/lint/effect.ts"
import jestPreset from "#presets/lint/jest.ts"
import nextjsPreset from "#presets/lint/nextjs.ts"
import reactStrictPreset from "#presets/lint/react-strict.ts"
import reactPreset from "#presets/lint/react.ts"
import strictPreset from "#presets/lint/strict.ts"
import tailwindPreset from "#presets/lint/tailwind.ts"
import tanstackPreset from "#presets/lint/tanstack.ts"
import vitestPreset from "#presets/lint/vitest.ts"
import vuePreset from "#presets/lint/vue.ts"

interface LintPresetDefinition {
  readonly config: OxlintConfig
  readonly excludes?: readonly LintPreset[]
  readonly hint: string
  readonly label: string
  readonly plugin?: OxlintPlugin
  readonly requires?: readonly LintPreset[]
}

const definitions = {
  architecture: {
    config: architecturePreset,
    hint: "Check the layer maps and import owners you define.",
    label: "architecture",
  },
  effect: {
    config: effectPreset,
    hint: "Find effects that never run.",
    label: "effect",
    plugin: effectTsgo,
  },
  jest: {
    config: jestPreset,
    excludes: ["vitest"],
    hint: "Find focused or skipped tests and check assertions.",
    label: "jest",
  },
  nextjs: {
    config: nextjsPreset,
    hint: "Check Next.js scripts, fonts, images, and head usage.",
    label: "next.js",
  },
  react: {
    config: reactPreset,
    hint: "Check React code, JSX accessibility, and performance.",
    label: "react",
  },
  "react-strict": {
    config: reactStrictPreset,
    hint: "Keep state, effect, and memo hooks in hook files.",
    label: "react-strict",
    plugin: reactDoctor,
    requires: ["react"],
  },
  strict: {
    config: strictPreset,
    hint: "Ban type assertions, unknown parameters, module mocks, and TODOs.",
    label: "strict",
  },
  tailwind: {
    config: tailwindPreset,
    hint: "Check Tailwind v4 classes.",
    label: "tailwind",
    plugin: tailwind,
  },
  tanstack: {
    config: tanstackPreset,
    hint: "Use queryOptions() and keep query data out of state.",
    label: "tanstack",
  },
  vitest: {
    config: vitestPreset,
    excludes: ["jest"],
    hint: "Find focused or skipped tests and check assertions.",
    label: "vitest",
  },
  vue: {
    config: vuePreset,
    hint: "Check Vue 3 code for errors and deprecated APIs.",
    label: "vue",
  },
} as const satisfies Record<LintPreset, LintPresetDefinition>

export const lintPresets = LINT_PRESETS.map((name) => ({ ...definitions[name], name }))

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
