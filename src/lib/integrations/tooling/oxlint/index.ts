import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Project } from "#lib/workspace/project.ts"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import {
  detectToolingConfig,
  getConfigFindings,
  getPackageActions,
  getPackageFindings,
} from "#lib/integrations/tooling/base.ts"
import * as commands from "#lib/integrations/tooling/oxlint/command.ts"
import {
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
  type LintPreset,
} from "#lib/integrations/tooling/oxlint/config.ts"
import { assessOxlintRuntime } from "#lib/integrations/tooling/oxlint/runtime-assessment.ts"
import { writeFile } from "#lib/shared/filesystem.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getManagedScripts } from "#lib/workspace/package-json.ts"

const CONFIG_FILE = "oxlint.config.ts"
const LEGACY_CONFIG_FILE = ".oxlintrc.json"

const files = [
  { path: CONFIG_FILE, type: "config" },
  { path: LEGACY_CONFIG_FILE, type: "legacy_config" },
] as const

const configFiles = { config: CONFIG_FILE, legacyConfigs: [LEGACY_CONFIG_FILE] }

const VERSION = getDependencyVersion("oxlint")

const detect = (cwd: string) => detectToolingConfig(cwd, "oxlint", configFiles)

export default defineIntegration({
  assess: (project: Project) =>
    Effect.gen(function* () {
      const { cwd, lintConfig, packageJson } = project
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return {
          applicable: false,
        } satisfies IntegrationAssessment
      }

      const state = yield* detect(cwd)
      const runtimeFindings = yield* assessOxlintRuntime(project)
      const packageActions = getPackageActions(
        packageJson,
        { name: "oxlint", version: VERSION },
        "the managed lint scripts"
      )

      // The active TypeScript config is `oxlint.config.ts`, which the project holds.
      const inspection =
        state.active?.format === "ts"
          ? lintConfig.pipe(
              Option.map((content) => inspectRequiredOxlintConfig(content)),
              Option.getOrUndefined
            )
          : undefined
      const configContent = toOxlintTsConfigContent()

      return {
        applicable: true,
        findings: [
          ...getPackageFindings(packageActions, "oxlint"),
          ...runtimeFindings,
          ...getConfigFindings(state, {
            configContent,
            configFile: CONFIG_FILE,
            inspection,
            invalidGoal:
              "Set `respectEslintDisableDirectives`, `typeAware`, and `typeCheck` to `true` in the `options` object. Preserve every other project setting.",
            toolName: "oxlint",
          }),
        ],
        packageActions,
        warnings: state.warnings,
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
