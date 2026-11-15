import * as Schema from "effect/Schema"
import { SCRIPT_ORDER } from "#lib/project/package-json.ts"

/**
 * Every lint preset a target project can select besides core, in the order that init offers them.
 * Each one is published as `adamantite/lint/<name>`. `tooling/oxlint/presets.ts` describes each
 * one.
 */
export const LINT_PRESETS = [
  "react",
  "react-strict",
  "tanstack",
  "nextjs",
  "vue",
  "effect",
  "jest",
  "vitest",
  "architecture",
  "strict",
  "tailwind",
] as const

export type LintPreset = (typeof LINT_PRESETS)[number]

/**
 * The values of `--typescript`. `typescript` adds the type resets to the strict options of
 * `tsconfig`, so a config that extends both counts as `typescript`.
 */
export const TYPESCRIPT_PRESET_NAMES = ["typescript", "tsconfig"] as const

export type TypeScriptPreset = (typeof TYPESCRIPT_PRESET_NAMES)[number]

/**
 * The editors that init can set up, in the order that it sets them up.
 */
export const INIT_EDITORS = ["vscode", "zed"] as const

export type InitEditor = (typeof INIT_EDITORS)[number]

/**
 * What `init` was asked to set up. `presets` starts with `core` when the project lints, and is
 * empty otherwise. Each list keeps the order of its source list, so two selections of the same
 * setup are equal.
 */
export const Selection = Schema.Struct({
  agents: Schema.Boolean,
  ci: Schema.NullOr(Schema.Literal("github")),
  editors: Schema.Array(Schema.Literals(INIT_EDITORS)),
  presets: Schema.Array(Schema.Literals(["core", ...LINT_PRESETS])),
  scripts: Schema.Array(Schema.Literals(SCRIPT_ORDER)),
  typescript: Schema.NullOr(Schema.Literals(TYPESCRIPT_PRESET_NAMES)),
})

export type Selection = typeof Selection.Type

const PRESET_ORDER = ["core", ...LINT_PRESETS] as const

/**
 * The selection after `init` sets up `next` in a project that `previous` describes. Init adds setup
 * and removes none, so each part keeps what `previous` selected, and `next` replaces the TypeScript
 * preset that it names.
 */
export function addSelection(previous: Selection, next: Selection): Selection {
  return {
    agents: previous.agents || next.agents,
    ci: next.ci ?? previous.ci,
    editors: INIT_EDITORS.filter((editor) =>
      [...previous.editors, ...next.editors].includes(editor)
    ),
    presets: PRESET_ORDER.filter((preset) =>
      [...previous.presets, ...next.presets].includes(preset)
    ),
    scripts: SCRIPT_ORDER.filter((script) =>
      [...previous.scripts, ...next.scripts].includes(script)
    ),
    typescript: next.typescript ?? previous.typescript,
  }
}
