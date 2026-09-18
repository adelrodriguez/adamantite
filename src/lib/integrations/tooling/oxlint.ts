import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import { defineIntegration, type IntegrationAssessment } from "#lib/integrations/base.ts"
import { readFile, writeFile } from "#lib/shared/filesystem.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getManagedScripts } from "#lib/workspace/package-json.ts"
import {
  detectToolingConfig,
  getConfigFindings,
  getPackageActions,
  getPackageFindings,
  type RequiredConfigInspection,
} from "#lib/workspace/tooling/config.ts"
import {
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
} from "#lib/workspace/tooling/oxlint.ts"

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
  assess: (cwd: string, packageJson: PackageJson) =>
    Effect.gen(function* () {
      const managedScripts = getManagedScripts(packageJson)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return {
          applicable: false,
          warnings: [],
        } satisfies IntegrationAssessment
      }

      const state = yield* detect(cwd)
      const packageActions = getPackageActions(
        packageJson,
        { name: "oxlint", version: VERSION },
        "the managed lint scripts"
      )

      const activeConfig = state.active
      let inspection: RequiredConfigInspection | undefined

      if (activeConfig?.format === "ts") {
        const content = yield* readFile(activeConfig.path)
        inspection = inspectRequiredOxlintConfig(content)
      }

      const configContent = toOxlintTsConfigContent()

      return {
        applicable: true,
        findings: [
          ...getPackageFindings(packageActions, "oxlint"),
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
  config: CONFIG_FILE,
  create: (cwd: string, presets: string[] = []) =>
    Effect.gen(function* () {
      const path = yield* Path.Path
      const payload = toOxlintTsConfigContent(presets)

      yield* writeFile(path.join(cwd, CONFIG_FILE), payload)
    }),
  detect,
  files,
  kind: "tooling",
  name: "oxlint",
  version: VERSION,
})
