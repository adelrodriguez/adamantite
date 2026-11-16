import { existsSync, readdirSync } from "node:fs"
import { join, relative, sep } from "node:path"
import * as EffectArray from "effect/Array"
import * as Order from "effect/Order"
import * as EffectRecord from "effect/Record"
import { type LintPreset, listStacks, type Stack, STACKS } from "./stacks.ts"

/**
 * The idiom fixtures: ordinary code of each stack, adapted from permissively licensed projects.
 * `SOURCES.md` in the folder names the source and the license of each file.
 */
export const IDIOMS_DIR = join(import.meta.dirname, "../../src/__tests__/presets/fixtures/idioms")

const ONE_FIX_PASS = "https://github.com/oxc-project/oxc/issues/16118"

interface SecondPass {
  /**
   * Path of the idiom relative to `fixable/`.
   */
  readonly file: string
  /**
   * The upstream issue that makes the second fix necessary.
   */
  readonly issue: string
}

export interface IdiomTree {
  /**
   * The unstable Effect modules that the idioms use, which a target project must allow. See
   * "Effect" in the README.
   */
  readonly allowedUnstableApis?: readonly string[]
  /**
   * The preset that the idioms need. Their files are in `fixtures/idioms/<preset>`. Core idioms run
   * with every stack.
   */
  readonly preset: "core" | LintPreset
  /**
   * Each fixable idiom that one fix does not end, because a fix causes a new report. The idiom test
   * runs a second fix for these idioms only. It fails when one fix ends a listed idiom, so the
   * correction upstream removes its entry.
   */
  readonly secondPasses: readonly SecondPass[]
}

export const IDIOM_TREES: readonly IdiomTree[] = [
  {
    preset: "core",
    // `no-else-return` moves a statement, and the blank line that the spacing rule then needs
    // comes in the next pass.
    secondPasses: [{ file: "moved.ts", issue: ONE_FIX_PASS }],
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

/**
 * The files below the folder, relative to it, with forward slashes, in sorted order. A tree without
 * the folder has no files in it.
 */
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

/**
 * The stacks that lint the idioms of the preset. Core idioms run with every stack.
 */
export function listTreeStacks(preset: IdiomTree["preset"]): Stack[] {
  return preset === "core" ? EffectRecord.keys(STACKS) : listStacks(preset)
}
