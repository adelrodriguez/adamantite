import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import {
  assessConfigFile,
  type ConfigFile,
  renderConfigFile,
} from "#lib/integrations/config-file.ts"
import {
  getExtendedLintPresets,
  inspectExtendsOrder,
  inspectRequiredOxlintConfig,
  type MisplacedCorePreset,
  toOxlintTsConfigContent,
} from "#lib/integrations/oxlint/config.ts"
import { listLintedFiles } from "#lib/integrations/oxlint/files.ts"
import { managedPlugins } from "#lib/integrations/oxlint/plugins/managed.ts"
import { findExcludedPresets } from "#lib/integrations/oxlint/presets.ts"
import { assessOxlintRuntime } from "#lib/integrations/oxlint/runtime-assessment.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { LINT_PRESETS, type LintPreset, type Selection } from "#lib/project/selection.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const CONFIG = {
  legacy: [".oxlintrc.json"],
  path: "oxlint.config.ts",
  tool: "oxlint",
  whyLegacyBlocks: "Oxlint loads no config when it finds both",
} as const satisfies ConfigFile

export const PACKAGE = { name: "oxlint", version: getDependencyVersion("oxlint") }

/**
 * The selected lint presets besides core, in the order of `LINT_PRESETS`.
 */
function listPresets({ presets }: Selection): readonly LintPreset[] {
  return LINT_PRESETS.filter((preset) => presets.includes(preset))
}

/**
 * The finding for a config that lists an Adamantite preset before the core preset in `extends`.
 * Assessment does not write the config.
 */
function toCorePresetOrderFinding({ before, core }: MisplacedCorePreset): Finding {
  const presets = before.map((name) => `\`${name}\``).join(", ")

  return {
    currentState: `\`oxlint.config.ts\` lists ${presets} before the core preset \`${core}\` in \`extends\`.`,
    goal: [
      `Move \`${core}\` to the position directly before \`${Array.headNonEmpty(before)}\`, the first Adamantite preset in the \`extends\` array. Keep one \`${core}\` entry, and keep the order of the other entries.`,
      "Oxlint applies the `extends` entries in order, and a later entry replaces the rules of an earlier one. A preset, such as strict or effect, changes some rules of core. When core comes after the preset, the rules of core replace those changes.",
      "Run `adamantite check`, and correct the code that the restored rules report. Then run `adamantite doctor` again.",
    ],
    id: "core-preset-order",
    integration: "oxlint",
    title: "The core preset must come before the other Adamantite presets in extends",
  }
}

/**
 * The finding for a config that extends two presets that report the same defects, such as jest and
 * vitest. Assessment does not write the config.
 */
function toExcludedPresetsFinding({
  excluded,
  preset,
}: {
  readonly excluded: LintPreset
  readonly preset: LintPreset
}): Finding {
  return {
    currentState: `\`oxlint.config.ts\` extends the \`${preset}\` and \`${excluded}\` presets, which report the same defects. Each defect gets two reports.`,
    goal: [
      `Keep the preset of the tool that the project uses, and remove the import and the \`extends\` entry of the other. Keep all other project settings.`,
      `If some files need \`${preset}\` and other files need \`${excluded}\`, remove the two \`extends\` entries. Add an \`overrides\` entry for each preset with \`files\` that do not overlap, as the documentation comment of each preset shows.`,
      "Run `adamantite check`, then run `adamantite doctor` again.",
    ],
    id: "excluded-presets",
    integration: "oxlint",
    title: "The config extends two presets that report the same defects",
  }
}

/**
 * The finding for a lint config that every lint run fails to load. Oxlint loads every config of the
 * project before it lists the files to lint, so a failed list is such a config. A missing package
 * or runtime has its own finding, and Oxlint does not run without it.
 */
const assessConfigLoad = Effect.fn("assessConfigLoad")(function* (
  project: Project,
  runtimeFindings: readonly Finding[]
) {
  const declared =
    project.packageJson.devDependencies?.["oxlint"] ?? project.packageJson.dependencies?.["oxlint"]

  if (declared === undefined || runtimeFindings.length > 0) {
    return []
  }

  return yield* listLintedFiles(project.cwd).pipe(
    Effect.as([]),
    Effect.catchTag("TrialLintFailed", ({ output }) =>
      Effect.succeed([
        {
          currentState: `Oxlint fails to load the lint config, so \`adamantite check\` and \`adamantite fix\` stop before they lint a file. Oxlint printed:\n\n\`\`\`text\n${output}\n\`\`\``,
          goal: [
            "Repair the config that the error names. Keep its rules and all other project settings.",
            "When the config imports an Adamantite preset that the installed package does not export, replace the import with the preset that the changelog at https://github.com/adelrodriguez/adamantite/blob/main/CHANGELOG.md names for it.",
            "Run `adamantite check --only lint`, then run `adamantite doctor` again.",
          ],
          id: "oxlint-config-load-failure",
          integration: "oxlint",
          title: "Oxlint cannot load the lint config",
        } satisfies Finding,
      ])
    )
  )
})

export default {
  assess: (project: Project, selection: Selection) =>
    Effect.gen(function* () {
      const { cwd, lintConfig } = project
      const runtimeFindings = yield* assessOxlintRuntime(project)
      const loadFindings = yield* assessConfigLoad(project, runtimeFindings)
      const pkg = assessPackage(project, PACKAGE, "the managed lint scripts", "oxlint")

      // The project read the root `oxlint.config.ts` already.
      const configFindings = yield* assessConfigFile(
        cwd,
        CONFIG,
        lintConfig,
        toOxlintTsConfigContent(listPresets(selection)),
        inspectRequiredOxlintConfig
      )

      const presetOrderFindings = lintConfig.pipe(
        Option.flatMap((content) => inspectExtendsOrder(content)),
        Option.map((misplaced) => toCorePresetOrderFinding(misplaced)),
        Option.toArray
      )

      const excludedPresetsFindings = lintConfig.pipe(
        Option.flatMap((content) =>
          Array.head(findExcludedPresets(getExtendedLintPresets(content)))
        ),
        Option.map((excluded) => toExcludedPresetsFinding(excluded)),
        Option.toArray
      )

      return {
        findings: [
          ...pkg.findings,
          ...runtimeFindings,
          ...loadFindings,
          ...presetOrderFindings,
          ...excludedPresetsFindings,
          ...configFindings,
        ],
        packageActions: pkg.packageActions,
        warnings: pkg.warnings,
      }
    }),
  files: ({ cwd }: Project, selection: Selection) =>
    renderConfigFile(cwd, CONFIG, toOxlintTsConfigContent(listPresets(selection))),
  name: "oxlint",
  // Oxlint runs the type-aware rules on tsrs, and a preset with a managed plugin loads that plugin
  // from the project.
  packages: (_project: Project, selection: Selection) => [
    PACKAGE,
    { name: tsrs.name, version: tsrs.version },
    ...managedPlugins
      .filter((plugin) => selection.presets.includes(plugin.preset))
      .map(({ name, version }) => ({ name, version })),
  ],
  prepare: (_project: Project) => Effect.void,
  selected: ({ scripts }: Selection) => checkRunsTool(scripts, "oxlint"),
} satisfies Integration
