import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import * as Result from "effect/Result"
import type { Finding, Integration } from "#lib/integrations/base.ts"
import {
  assessConfigFile,
  type ConfigFile,
  renderConfigFile,
} from "#lib/integrations/config-file.ts"
import {
  findMisplacedCorePreset,
  inspectRequiredOxlintConfig,
  listAppliedLintPresets,
  listLintPresets,
  type MisplacedCorePreset,
  toOxlintTsConfigContent,
} from "#lib/integrations/oxlint/config.ts"
import { listLintedFiles } from "#lib/integrations/oxlint/files.ts"
import { managedPlugins } from "#lib/integrations/oxlint/plugins/managed.ts"
import { findExcludedPresets } from "#lib/integrations/oxlint/presets.ts"
import { listReplacementWarnings } from "#lib/integrations/oxlint/replacements.ts"
import { assessOxlintRuntime } from "#lib/integrations/oxlint/runtime-assessment.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import { CONFIG_FILES } from "#lib/project/custom-rules/discover.ts"
import * as Project from "#lib/project/index.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { LINT_PRESETS, type LintPreset, type Selection } from "#lib/project/selection.ts"
import { checkExists } from "#lib/shared/filesystem.ts"
import { publicImport } from "#lib/shared/package-exports.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const CONFIG = {
  conflicting: [".oxlintrc.json", ".oxlintrc.jsonc"],
  path: "oxlint.config.ts",
  tool: "oxlint",
  whyConflicting: "Oxlint fails when it finds both in one folder",
} as const satisfies ConfigFile

export const PACKAGE = { name: "oxlint", version: getDependencyVersion("oxlint") }

/**
 * The Oxlint config of the nearest parent folder of `cwd`, relative to `cwd`, up to the filesystem
 * root. Oxlint run in that folder loads a config in `cwd` as a nested config, and rejects the
 * `options` that only a root config can set. A folder that holds `.git` does not stop it.
 */
export const findParentConfig = Effect.fn("findParentConfig")(function* (cwd: string) {
  const path = yield* Path.Path
  const parents: string[] = []

  for (let folder = cwd; path.dirname(folder) !== folder; folder = path.dirname(folder)) {
    parents.push(path.dirname(folder))
  }

  const config = yield* Effect.findFirst(
    parents.flatMap((folder) =>
      [...CONFIG_FILES, ...CONFIG.conflicting].map((name) => path.join(folder, name))
    ),
    (file) => checkExists(file)
  )

  return Option.map(config, (file) => path.relative(cwd, file))
})

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
  const presets = before.map((module) => `\`${module}\``).join(", ")

  return {
    currentState: `\`oxlint.config.ts\` applies ${presets} before the core preset \`${core}\` in \`extends\`.`,
    goal: [
      `Move the core preset \`${core}\` to the position directly before \`${Array.headNonEmpty(before)}\`, the first Adamantite preset that Oxlint applies. Keep one core entry, and keep the order of the other entries.`,
      "Oxlint applies the `extends` entries in order, and a later entry replaces the rules of an earlier one. A preset, such as strict or effect, changes some rules of core. When core comes after the preset, the rules of core replace those changes.",
      "Run `adamantite check`, and correct the code that the restored rules report. Then run `adamantite doctor` again.",
    ],
    id: "core-preset-order",
    integration: "oxlint",
    title: "The core preset must come before the other Adamantite presets in extends",
  }
}

/**
 * The finding for a lint preset that the lockfile selects and no Oxlint config of the project
 * applies. Assessment does not write the config.
 */
function toMissingPresetFinding(preset: LintPreset): Finding {
  const module = publicImport(`./lint/${preset}`)

  return {
    currentState: `The lockfile selects the \`${preset}\` preset, and no Oxlint config of the project applies \`${module}\`.`,
    goal: [
      `Import \`${module}\` in \`oxlint.config.ts\`, and add it to \`extends\` after the core preset. Keep all other project settings.`,
      "If only some workspace packages need the preset, apply it in the Oxlint config of each of those packages instead.",
      "Run `adamantite check`, and correct the code that the added rules report. Then run `adamantite doctor` again. It must not report this finding.",
    ],
    id: "missing-lint-preset",
    integration: "oxlint",
    title: "The config does not apply a selected lint preset",
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
  project: Project.Snapshot,
  runtimeFindings: readonly Finding[]
) {
  const declared =
    project.packageJson.devDependencies?.["oxlint"] ?? project.packageJson.dependencies?.["oxlint"]

  if (declared === undefined || runtimeFindings.length > 0) {
    return []
  }

  return yield* listLintedFiles(yield* Project.Directory).pipe(
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
  assess: (project: Project.Snapshot, selection: Selection) =>
    Effect.gen(function* () {
      const cwd = yield* Project.Directory
      const { lintConfig } = project
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

      const loaded = Option.flatMap(lintConfig, Result.getSuccess)

      const presetOrderFindings = loaded.pipe(
        Option.flatMap((config) => findMisplacedCorePreset(config)),
        Option.map((misplaced) => toCorePresetOrderFinding(misplaced)),
        Option.toArray
      )

      // A preset counts where any config that Oxlint loads applies it, also in an override or a
      // workspace package config. A config that does not load can apply any preset.
      const applied = listAppliedLintPresets(project)

      const missingPresetFindings =
        Option.isSome(loaded) && project.customRules.unloadedConfigs.length === 0
          ? listPresets(selection)
              .filter((preset) => !applied.includes(preset))
              .map((preset) => toMissingPresetFinding(preset))
          : []

      const excludedPresetsFindings = loaded.pipe(
        Option.flatMap((config) => Array.head(findExcludedPresets(listLintPresets(config)))),
        Option.map((excluded) => toExcludedPresetsFinding(excluded)),
        Option.toArray
      )

      const replacementWarnings = yield* listReplacementWarnings(project)

      return {
        findings: [
          ...pkg.findings,
          ...runtimeFindings,
          ...loadFindings,
          ...missingPresetFindings,
          ...presetOrderFindings,
          ...excludedPresetsFindings,
          ...configFindings,
        ],
        packageActions: pkg.packageActions,
        warnings: [...pkg.warnings, ...replacementWarnings],
      }
    }),
  files: (_project: Project.Snapshot, selection: Selection) =>
    Effect.gen(function* () {
      return yield* renderConfigFile(
        yield* Project.Directory,
        CONFIG,
        toOxlintTsConfigContent(listPresets(selection))
      )
    }),
  name: "oxlint",
  // Oxlint runs the type-aware rules on tsrs, and a preset with a managed plugin loads that plugin
  // from the project.
  packages: (_project: Project.Snapshot, selection: Selection) => [
    PACKAGE,
    { name: tsrs.name, version: tsrs.version },
    ...managedPlugins
      .filter((plugin) => selection.presets.includes(plugin.preset))
      .map(({ name, version }) => ({ name, version })),
  ],
  selected: ({ scripts }: Selection) => checkRunsTool(scripts, "oxlint"),
} satisfies Integration
