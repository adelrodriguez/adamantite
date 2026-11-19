import { join } from "node:path"
import type { OxlintConfig } from "oxlint"

const REPO_ROOT = join(import.meta.dirname, "../..")
const LINT_PRESETS_DIR = join(REPO_ROOT, "presets/lint")

export const STACKS = {
  effect: ["effect", "vitest", "strict"],
  jest: ["jest", "architecture", "strict"],
  react: ["react", "react-strict", "tanstack", "nextjs", "vitest", "strict", "tailwind"],
  vue: ["vue", "vitest", "strict"],
} as const satisfies Record<string, readonly string[]>

export type Stack = keyof typeof STACKS

export type LintPreset = (typeof STACKS)[Stack][number]

export const STACK_OPTIONS = {
  typeAware: true,
  typeCheck: true,
} as const satisfies OxlintConfig["options"]

export function listStacks(preset: LintPreset): Stack[] {
  return Object.keys(STACKS)
    .filter((name): name is Stack => name in STACKS)
    .filter((stack) => {
      const presets: readonly LintPreset[] = STACKS[stack]

      return presets.includes(preset)
    })
}

export function listStackPresets(stack: Stack): string[] {
  return [
    join(LINT_PRESETS_DIR, "core.ts"),
    ...STACKS[stack].map((preset) => join(LINT_PRESETS_DIR, `${preset}.ts`)),
  ]
}
