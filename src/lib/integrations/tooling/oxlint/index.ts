import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { LintPreset } from "#lib/project/selection.ts"
import {
  defineIntegration,
  type Finding,
  type IntegrationAssessment,
} from "#lib/integrations/base.ts"
import {
  CurrentToolingConfig,
  detectToolingConfig,
  getConfigFindings,
  assessPackage,
  type ToolingConfigFiles,
} from "#lib/integrations/tooling/base.ts"
import * as commands from "#lib/integrations/tooling/oxlint/command.ts"
import {
  getExtendedLintPresets,
  inspectExtendsOrder,
  inspectRequiredOxlintConfig,
  type MisplacedCorePreset,
  toOxlintTsConfigContent,
} from "#lib/integrations/tooling/oxlint/config.ts"
import { listLintedFiles } from "#lib/integrations/tooling/oxlint/files.ts"
import { findExcludedPresets } from "#lib/integrations/tooling/oxlint/presets.ts"
import { assessOxlintRuntime } from "#lib/integrations/tooling/oxlint/runtime-assessment.ts"
import { checkRunsTool } from "#lib/project/package-json.ts"
import { getSelectedScripts, type Project } from "#lib/project/project.ts"
import { writeFile } from "#lib/shared/filesystem.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }

const CONFIG_FILE = "oxlint.config.ts"
const LEGACY_CONFIG_FILE = ".oxlintrc.json"

const files = [
  { path: CONFIG_FILE, type: "config" },
  { path: LEGACY_CONFIG_FILE, type: "legacy_config" },
] as const

const configFiles = {
  config: CONFIG_FILE,
  legacyConfigs: [LEGACY_CONFIG_FILE],
} satisfies ToolingConfigFiles

const VERSION = getDependencyVersion("oxlint")

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

const detect = (cwd: string) => detectToolingConfig(cwd, "oxlint", configFiles)

export default defineIntegration({
  assess: (project: Project) =>
    Effect.gen(function* () {
      const { cwd, lintConfig } = project

      if (!checkRunsTool(getSelectedScripts(project), "oxlint")) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const state = yield* detect(cwd)
      const runtimeFindings = yield* assessOxlintRuntime(project)

      const declared =
        project.packageJson.devDependencies?.["oxlint"]
        ?? project.packageJson.dependencies?.["oxlint"]

      // Oxlint loads every config of the project before it lists the files to lint, so a failed list
      // is a config that every lint run fails to load. A missing package or runtime has its own
      // finding, and Oxlint does not run without it.
      const loadFindings: readonly Finding[] =
        declared && runtimeFindings.length === 0
          ? yield* listLintedFiles(cwd).pipe(
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
                  },
                ])
              )
            )
          : []

      const pkg = assessPackage(
        project,
        { name: "oxlint", version: VERSION },
        "the managed lint scripts",
        "oxlint"
      )

      // The active TypeScript config is `oxlint.config.ts`, which the project holds.
      const inspection =
        state.active instanceof CurrentToolingConfig
          ? lintConfig.pipe(
              Option.map((content) => inspectRequiredOxlintConfig(content)),
              Option.getOrUndefined
            )
          : undefined

      const configContent = toOxlintTsConfigContent()

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
        applicable: true,
        findings: [
          ...pkg.findings,
          ...runtimeFindings,
          ...loadFindings,
          ...presetOrderFindings,
          ...excludedPresetsFindings,
          ...getConfigFindings(state, {
            configContent,
            configFile: CONFIG_FILE,
            inspection,
            toolName: "oxlint",
          }),
        ],
        packageActions: pkg.packageActions,
        warnings: [...pkg.warnings, ...state.warnings],
      } satisfies IntegrationAssessment
    }),
  check: commands.check,
  config: CONFIG_FILE,
  create: (cwd: string, presets: readonly LintPreset[] = []) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const payload = toOxlintTsConfigContent(presets)

      yield* writeFile(path.join(cwd, CONFIG_FILE), payload)
    }),
  detect,
  files,
  fix: commands.fix,
  kind: "tooling",
  name: "oxlint",
  version: VERSION,
})
