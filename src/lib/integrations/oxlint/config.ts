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

// The `printWidth` of the format preset, which the rendered config fits.
const PRINT_WIDTH = 100

/**
 * The `oxlint.config.ts` that Adamantite writes, in the layout that Oxfmt gives it: the imports
 * sorted by module, and `extends` on one line when it fits. It always extends `custom()`, which is
 * an empty config until the project adds a rule to `.adamantite/lint`. `extends` keeps the order of
 * the presets, because a later entry replaces the rules of an earlier one.
 */
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
    ...(extendsLine.length <= PRINT_WIDTH
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

/**
 * The Adamantite lint presets that a loaded `oxlint.config.ts` applies, such as `react` for
 * `adamantite/lint/react`, in the order that Oxlint applies them. Core and `custom()` are not
 * listed.
 */
export function listLintPresets(config: LintConfig): string[] {
  return listPresetModules(config).flatMap((module) =>
    module.startsWith(LINT_PRESET_PREFIX) ? [module.slice(LINT_PRESET_PREFIX.length)] : []
  )
}

/**
 * The Adamantite lint presets that the Oxlint configs of `project` apply anywhere: the root config
 * and the config of each workspace package that Oxlint loads, through `extends` or in an override.
 * Core and `custom()` are not listed. A config that does not load applies none.
 */
export function listAppliedLintPresets({ customRules }: Project.Snapshot): readonly string[] {
  return customRules.loadedConfigs.flatMap((config) =>
    listAppliedPresetModules(config).flatMap((module) =>
      module.startsWith(LINT_PRESET_PREFIX) ? [module.slice(LINT_PRESET_PREFIX.length)] : []
    )
  )
}

/**
 * The Adamantite lint presets that Oxlint applies before the core preset.
 */
export interface MisplacedCorePreset {
  /**
   * The modules of the presets that Oxlint applies before the last core preset, in order. The list
   * is not empty.
   */
  readonly before: Array.NonEmptyReadonlyArray<string>
  /**
   * The module of the core preset.
   */
  readonly core: string
}

/**
 * Find the Adamantite presets that a loaded `oxlint.config.ts` applies before the last core preset.
 * Oxlint applies the `extends` entries in order, and a later entry replaces the rules of an earlier
 * one, so core replaces each change that an earlier preset makes to a core rule. An entry that is
 * not an Adamantite preset can come before core. A config that does not extend core has none.
 */
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

/**
 * Whether a loaded `oxlint.config.ts` sets each required option to `true` in its own `options`.
 */
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
