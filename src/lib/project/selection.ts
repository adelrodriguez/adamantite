import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import {
  checkRunsTool,
  getScriptsThatRun,
  MANAGED_TOOLS,
  SCRIPT_ORDER,
} from "#lib/project/package-json.ts"
import { ToolNotSelected } from "#lib/shared/errors.ts"

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

export const TYPESCRIPT_PRESET_NAMES = ["typescript", "tsconfig"] as const

export type TypeScriptPreset = (typeof TYPESCRIPT_PRESET_NAMES)[number]

export const INIT_EDITORS = ["vscode", "zed"] as const

export type InitEditor = (typeof INIT_EDITORS)[number]

export const Selection = Schema.Struct({
  agents: Schema.Boolean,
  ci: Schema.NullOr(Schema.Literal("github")),
  editors: Schema.Array(Schema.Literals(INIT_EDITORS)),
  presets: Schema.Array(Schema.Literals(["core", ...LINT_PRESETS])),
  scripts: Schema.Array(Schema.Literals(SCRIPT_ORDER)),
  typescript: Schema.NullOr(Schema.Literals(TYPESCRIPT_PRESET_NAMES)),
})

export type Selection = typeof Selection.Type

export function toToolNotSelected(
  selection: Option.Option<Selection>,
  name: string
): Option.Option<ToolNotSelected> {
  return Option.flatMap(selection, ({ scripts }) =>
    Option.flatMap(
      Array.findFirst(MANAGED_TOOLS, (tool) => tool === name && !checkRunsTool(scripts, tool)),
      (tool) =>
        Option.map(
          Array.head(getScriptsThatRun(tool)),
          (script) => new ToolNotSelected({ script, tool })
        )
    )
  )
}

const PRESET_ORDER = ["core", ...LINT_PRESETS] as const

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
