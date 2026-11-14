import { join } from "node:path"
import type { OxlintConfig } from "oxlint"
import { type LintPreset, lintPresets } from "#lib/integrations/tooling/oxlint/presets.ts"

const REPO_ROOT = join(import.meta.dirname, "../../..")

/**
 * Each stack: the presets that a target project selects together, without core. The preset tests
 * lint fixtures with a whole stack, so a rule of one preset that reports code that another preset
 * accepts fails a test. Each preset is in at least one stack.
 */
export const STACKS = {
  effect: ["effect", "vitest", "strict"],
  jest: ["jest", "architecture", "strict"],
  react: ["react", "react-strict", "tanstack", "nextjs", "vitest", "strict", "tailwind"],
  vue: ["vue", "vitest", "strict"],
} as const satisfies Record<string, readonly LintPreset[]>

export type Stack = keyof typeof STACKS

/**
 * The options that init writes to `oxlint.config.ts`.
 */
export const STACK_OPTIONS = {
  typeAware: true,
  typeCheck: true,
} as const satisfies OxlintConfig["options"]

/**
 * The stacks that have the preset.
 */
export function listStacks(preset: LintPreset): Stack[] {
  return Object.keys(STACKS)
    .filter((name): name is Stack => name in STACKS)
    .filter((stack) => STACKS[stack].some((name) => name === preset))
}

/**
 * Absolute paths of the stack's preset modules in the order of `extends` that init writes: core,
 * then the presets in the order of the preset catalog.
 */
export function listStackPresets(stack: Stack): string[] {
  const selected: readonly LintPreset[] = STACKS[stack]

  return [
    join(REPO_ROOT, "presets/lint/core.ts"),
    ...lintPresets
      .filter((preset) => selected.includes(preset.name))
      .map((preset) => join(REPO_ROOT, `presets/lint/${preset.name}.ts`)),
  ]
}
