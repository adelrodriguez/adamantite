import { existsSync, readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as EffectRecord from "effect/Record"
import { type LintPreset, listStacks, type Stack, STACKS } from "./stacks.ts"

export const IDIOMS_DIR = join(import.meta.dirname, "../../src/__tests__/presets/fixtures/idioms")

const ONE_FIX_PASS = "https://github.com/oxc-project/oxc/issues/16118"

interface SecondPass {
  readonly file: string
  readonly issue: string
}

export interface IdiomTree {
  readonly allowedUnstableApis?: readonly string[]
  readonly preset: "core" | LintPreset
  readonly secondPasses: readonly SecondPass[]
}

export const IDIOM_TREES: readonly IdiomTree[] = [
  {
    preset: "core",
    // `curly` wraps a statement in a block, and `no-else-return` moves a statement. The blank line
    // that the spacing rule then needs comes in the next pass.
    secondPasses: [
      { file: "braces.ts", issue: ONE_FIX_PASS },
      { file: "moved.ts", issue: ONE_FIX_PASS },
    ],
  },
  {
    allowedUnstableApis: [
      "@effect/platform-node/NodeRuntime",
      "@effect/platform-node/NodeServices",
      "@effect/vitest",
      "effect/cli",
      "effect/FileSystem",
      "effect/Path",
    ],
    preset: "effect",
    secondPasses: [],
  },
  {
    // `react/jsx-fragments` writes `<>`, and `eslint/no-unused-vars` then reports the import of
    // `Fragment`, which the next pass removes.
    preset: "react",
    secondPasses: [{ file: "fragment.tsx", issue: ONE_FIX_PASS }],
  },
  {
    preset: "react-strict",
    secondPasses: [],
  },
  {
    preset: "nextjs",
    secondPasses: [],
  },
  {
    preset: "tanstack",
    secondPasses: [],
  },
  {
    preset: "tailwind",
    secondPasses: [],
  },
  {
    preset: "vitest",
    secondPasses: [],
  },
  {
    // `jest/prefer-strict-equal` writes `toStrictEqual(3)`, and `jest/prefer-to-be` then writes
    // `toBe(3)` in the next pass.
    preset: "jest",
    secondPasses: [{ file: "equal.test.ts", issue: ONE_FIX_PASS }],
  },
  {
    // Oxlint lints the script of a `.vue` file, and Oxfmt formats the whole file. No rule reads a
    // template, and the type check skips `.vue` scripts, so these idioms prove neither.
    preset: "vue",
    secondPasses: [],
  },
]

export function listFiles(folder: string): string[] {
  if (!existsSync(folder)) {
    return []
  }

  const files = readdirSync(folder, { recursive: true, withFileTypes: true }).flatMap((entry) =>
    entry.isFile()
      ? [relative(folder, join(entry.parentPath, entry.name)).split(sep).join("/")]
      : []
  )

  return EffectArray.sort(files, Order.String)
}

export function listTreeStacks(preset: IdiomTree["preset"]): Stack[] {
  return preset === "core" ? EffectRecord.keys(STACKS) : listStacks(preset)
}
