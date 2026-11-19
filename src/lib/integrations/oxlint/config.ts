import * as Array from "effect/Array"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import type { RequiredConfigInspection } from "#lib/integrations/tooling/base.ts"
import type * as Project from "#lib/project/index.ts"
import type { LintPreset } from "#lib/project/selection.ts"
import {
  type LintConfig,
  listAppliedPresetModules,
  listPresetModules,
} from "#lib/project/lint-config.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

const REQUIRED_BOOLEAN_OPTIONS = [
  "respectEslintDisableDirectives",
  "typeAware",
  "typeCheck",
] as const

const OPTIONS_GOAL =
  "Set `respectEslintDisableDirectives`, `typeAware`, and `typeCheck` to `true` in the `options` object. Preserve every other project setting."

function getImportName(preset: LintPreset | "core") {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

const FORMAT_PRESET_PRINT_WIDTH = 100

export function toOxlintTsConfigContent(presets: readonly LintPreset[]) {
  const presetNames = ["core", ...presets] as const

  const imports = Array.sort(
    [
      ...presetNames.map((preset) => ({
        line: `import ${getImportName(preset)} from "${publicImport(preset === "core" ? "./lint" : `./lint/${preset}`)}"`,
        module: publicImport(preset === "core" ? "./lint" : `./lint/${preset}`),
      })),
      { line: `import custom from "${publicImport("./rules")}"`, module: publicImport("./rules") },
      { line: 'import { defineConfig } from "oxlint"', module: "oxlint" },
    ],
    Order.mapInput(Order.String, ({ module }: { readonly module: string }) => module)
  )

  const entries = [...presetNames.map((preset) => getImportName(preset)), "custom()"]
  const extendsLine = `  extends: [${entries.join(", ")}],`

  return [
    ...imports.map(({ line }) => line),
    "",
    "export default defineConfig({",
    ...(extendsLine.length <= FORMAT_PRESET_PRINT_WIDTH
      ? [extendsLine]
      : ["  extends: [", ...entries.map((entry) => `    ${entry},`), "  ],"]),
    "  ignorePatterns: core.ignorePatterns,",
    "  options: {",
    ...REQUIRED_BOOLEAN_OPTIONS.map((option) => `    ${option}: true,`),
    "  },",
    "})",
    "",
  ].join("\n")
}

const CORE_PRESET_MODULE = publicImport("./lint")

const LINT_PRESET_PREFIX = `${CORE_PRESET_MODULE}/`

export function listLintPresets(config: LintConfig): string[] {
  return listPresetModules(config).flatMap((module) =>
    module.startsWith(LINT_PRESET_PREFIX) ? [module.slice(LINT_PRESET_PREFIX.length)] : []
  )
}

export function listAppliedLintPresets({ customRules }: Project.Snapshot): readonly string[] {
  return customRules.loadedConfigs.flatMap((config) =>
    listAppliedPresetModules(config).flatMap((module) =>
      module.startsWith(LINT_PRESET_PREFIX) ? [module.slice(LINT_PRESET_PREFIX.length)] : []
    )
  )
}

export interface MisplacedCorePreset {
  readonly before: Array.NonEmptyReadonlyArray<string>
  readonly core: string
}

// Oxlint applies the `extends` entries in order, and a later entry replaces the rules of an
// earlier one.
export function findMisplacedCorePreset(config: LintConfig): Option.Option<MisplacedCorePreset> {
  const modules = listPresetModules(config).filter(
    (module) => module === CORE_PRESET_MODULE || module.startsWith(LINT_PRESET_PREFIX)
  )

  const before = modules
    .slice(0, Math.max(modules.lastIndexOf(CORE_PRESET_MODULE), 0))
    .filter((module) => module !== CORE_PRESET_MODULE)

  return Array.isReadonlyArrayNonEmpty(before)
    ? Option.some({ before, core: CORE_PRESET_MODULE })
    : Option.none()
}

export function inspectRequiredOxlintConfig(config: LintConfig): RequiredConfigInspection {
  if (config.options === undefined) {
    return {
      goal: OPTIONS_GOAL,
      kind: "invalid",
      reason: "The required Oxlint options are missing.",
    }
  }

  const { options } = config

  return REQUIRED_BOOLEAN_OPTIONS.every((option) => options[option] === true)
    ? { kind: "configured" }
    : {
        goal: OPTIONS_GOAL,
        kind: "invalid",
        reason: "The required Oxlint options are missing or are not set to true.",
      }
}
