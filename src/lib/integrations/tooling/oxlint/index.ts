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
  checkImportsLintPreset,
  inspectRequiredOxlintConfig,
  toOxlintTsConfigContent,
  type LintPreset,
} from "#lib/integrations/tooling/oxlint/config.ts"
import { assessLayerMaps } from "#lib/integrations/tooling/oxlint/layers.ts"
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
      const layerFindings = yield* assessLayerMaps(project)

      if (!managedScripts.includes("check") && !managedScripts.includes("fix")) {
        return layerFindings.length === 0
          ? ({ applicable: false } satisfies IntegrationAssessment)
          : ({
              applicable: true,
              findings: layerFindings,
              packageActions: [],
              warnings: [],
            } satisfies IntegrationAssessment)
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
      const presetFindings = checkImportsLintPreset(lintConfig, "shadcn")
        ? [
            {
              currentState:
                "`oxlint.config.ts` imports the removed `adamantite/lint/shadcn` preset.",
              goal: [
                "Replace `adamantite/lint/shadcn` with `adamantite/lint/tailwind` in `oxlint.config.ts`. Keep the local import name and its `extends` entry.",
                "Keep the managed `@shadcn/lint` package, `shadcn/*` rule names, `settings.shadcn` keys, rule severity, rule options, and all other project settings.",
                "Use `--preset tailwind` in init commands. Run `adamantite check`, then run `adamantite doctor` again.",
              ],
              id: "tailwind-preset-migration",
              integration: "oxlint",
              title: "The shadcn preset was renamed to tailwind",
            },
          ]
        : []

      return {
        applicable: true,
        findings: [
          ...getPackageFindings(packageActions, "oxlint"),
          ...runtimeFindings,
          ...presetFindings,
          ...layerFindings,
          ...getConfigFindings(state, {
            configContent,
            configFile: CONFIG_FILE,
            inspection,
            invalidGoal:
              "Set `respectEslintDisableDirectives`, `typeAware`, and `typeCheck` to `true` in the `options` object. Preserve every other project setting.",
            toolName: "oxlint",
          }),
          ...(checkImportsLintPreset(lintConfig, "react-doctor")
            ? [
                {
                  currentState:
                    "`oxlint.config.ts` imports the retired `adamantite/lint/react-doctor` preset.",
                  goal: [
                    "Replace `adamantite/lint/react-doctor` with `adamantite/lint/react-strict`. If react-strict is already imported, use its existing binding and remove the old import.",
                    "Keep the `react` preset and exactly one `react-strict` entry in extends. Keep `oxlint-plugin-react-doctor` as a devDependency. Run `adamantite update` if the package is missing or off its managed version.",
                    "Preserve project settings, custom rules, rule severity, and rule options, including `react-doctor/*` overrides. The upstream rule namespace stays the same.",
                    "The react-strict preset also reports state, effect, and memoization hooks outside hook modules. Follow those reports when updating feature code.",
                    "Run `adamantite check`, then run Doctor again.",
                  ],
                  id: "react-doctor-preset-migration",
                  integration: "oxlint",
                  title: "React Doctor rules now belong to react-strict",
                },
              ]
            : []),
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
