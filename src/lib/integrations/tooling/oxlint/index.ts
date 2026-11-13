import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Project } from "#lib/workspace/project.ts"
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
  checkImportsLintPreset,
  inspectExtendsOrder,
  inspectRequiredOxlintConfig,
  type MisplacedCorePreset,
  toOxlintTsConfigContent,
} from "#lib/integrations/tooling/oxlint/config.ts"
import {
  type LintPreset,
  RETIRED_LINT_PRESETS,
  type RetiredLintPreset,
} from "#lib/integrations/tooling/oxlint/presets.ts"
import { assessOxlintRuntime } from "#lib/integrations/tooling/oxlint/runtime-assessment.ts"
import { writeFile } from "#lib/shared/filesystem.ts"
import { getDependencyVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { getManagedScripts, checkRunsTool } from "#lib/workspace/package-json.ts"

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
 * The finding for an import of each preset that Adamantite no longer publishes, with the steps that
 * move the config to its replacement. Assessment does not write the config.
 */
const retiredLintPresetFindings = {
  antislop: {
    currentState: "`oxlint.config.ts` imports the retired `adamantite/lint/antislop` preset.",
    goal: [
      "Replace `adamantite/lint/antislop` with `adamantite/lint/strict`. If strict is already imported, remove the antislop import and its `extends` entry.",
      "Keep `anti-slop/*` rule settings, rule severity, rule options, and all other project settings. The rule namespace stays the same.",
      'strict sets `anti-slop/no-chained-type-assertions`, `anti-slop/no-widen-then-assert`, and `anti-slop/require-safety-comment-for-type-assertion` in an override for test files, which takes priority over top-level `rules`. Move a project setting for these three rules into an `overrides` entry with `files: ["**/*.{test,spec}.{ts,tsx,mts,cts}", "**/__tests__/**"]`.',
      "The strict preset also bans type assertions outside tests, console calls other than `console.info`, task comments, and deep destructuring, and it requires a reason on each suppression. Follow those reports when updating the code.",
      "Use `--preset strict` in init commands. Run `adamantite check`, then run `adamantite doctor` again.",
    ],
    id: "strict-preset-migration",
    integration: "oxlint",
    title: "The antislop rules now belong to strict",
  },
  "react-doctor": {
    currentState: "`oxlint.config.ts` imports the retired `adamantite/lint/react-doctor` preset.",
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
  shadcn: {
    currentState: "`oxlint.config.ts` imports the removed `adamantite/lint/shadcn` preset.",
    goal: [
      "Replace `adamantite/lint/shadcn` with `adamantite/lint/tailwind` in `oxlint.config.ts`. Keep the local import name and its `extends` entry.",
      "Keep the managed `@shadcn/lint` package, `shadcn/*` rule names, `settings.shadcn` keys, rule severity, rule options, and all other project settings.",
      "Use `--preset tailwind` in init commands. Run `adamantite check`, then run `adamantite doctor` again.",
    ],
    id: "tailwind-preset-migration",
    integration: "oxlint",
    title: "The shadcn preset was renamed to tailwind",
  },
} as const satisfies Record<RetiredLintPreset, Finding>

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

const detect = (cwd: string) => detectToolingConfig(cwd, "oxlint", configFiles)

export default defineIntegration({
  assess: (project: Project) =>
    Effect.gen(function* () {
      const { cwd, lintConfig, packageJson } = project
      const managedScripts = getManagedScripts(packageJson)

      if (!checkRunsTool(managedScripts, "oxlint")) {
        return { applicable: false } satisfies IntegrationAssessment
      }

      const state = yield* detect(cwd)
      const runtimeFindings = yield* assessOxlintRuntime(project)

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

      const retiredPresetFindings = RETIRED_LINT_PRESETS.flatMap((retired) =>
        checkImportsLintPreset(lintConfig, retired) ? [retiredLintPresetFindings[retired]] : []
      )

      const presetOrderFindings = lintConfig.pipe(
        Option.flatMap((content) => inspectExtendsOrder(content)),
        Option.map((misplaced) => toCorePresetOrderFinding(misplaced)),
        Option.toArray
      )

      return {
        applicable: true,
        findings: [
          ...pkg.findings,
          ...runtimeFindings,
          ...retiredPresetFindings,
          ...presetOrderFindings,
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
