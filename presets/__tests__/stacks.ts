import { join } from "node:path"
import type { OxlintConfig } from "oxlint"

const REPO_ROOT = join(import.meta.dirname, "../..")
const LINT_PRESETS_DIR = join(REPO_ROOT, "presets/lint")

/**
 * Each stack: the presets that a target project selects together, without core. The preset tests
 * lint fixtures with a whole stack, so a rule of one preset that reports code that another preset
 * accepts fails a test. Each preset is in at least one stack, which `stacks.test.ts` checks.
 */
export const STACKS = {
  effect: ["effect", "vitest", "strict"],
  jest: ["jest", "architecture", "strict"],
  react: ["react", "react-strict", "tanstack", "nextjs", "vitest", "strict", "tailwind"],
  vue: ["vue", "vitest", "strict"],
} as const satisfies Record<string, readonly string[]>

export type Stack = keyof typeof STACKS

/**
 * A lint preset besides core, by the name of its module in `presets/lint`.
 */
export type LintPreset = (typeof STACKS)[Stack][number]

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
    .filter((stack) => {
      const presets: readonly LintPreset[] = STACKS[stack]

      return presets.includes(preset)
    })
}

/**
 * Absolute paths of the stack's preset modules in the order of `extends`: core first, as init
 * writes it, then the presets of the stack. `overlap.test.ts` fails when two presets besides core
 * set one rule, so the order of the other presets does not change a report.
 */
export function listStackPresets(stack: Stack): string[] {
  return [
    join(LINT_PRESETS_DIR, "core.ts"),
    ...STACKS[stack].map((preset) => join(LINT_PRESETS_DIR, `${preset}.ts`)),
  ]
}
