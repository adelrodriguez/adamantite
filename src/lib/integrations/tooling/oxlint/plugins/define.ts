import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import type { Finding, IntegrationAssessment } from "#lib/integrations/base.ts"
import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { getImportedLintPresets, type LintPreset } from "#lib/integrations/tooling/oxlint/config.ts"
import { readFileIfExists } from "#lib/shared/filesystem.ts"

const OXLINT_CONFIG_FILE = "oxlint.config.ts"

/**
 * Whether `oxlint.config.ts` imports the lint preset, such as `effect` for
 * `adamantite/lint/effect`.
 */
export const checkImportsLintPreset = Effect.fn("checkImportsLintPreset")(function* (
  cwd: string,
  preset: string
) {
  const path = yield* Path.Path
  const content = yield* readFileIfExists(path.join(cwd, OXLINT_CONFIG_FILE))

  return Option.match(content, {
    onNone: () => false,
    onSome: (value) => getImportedLintPresets(value).includes(preset),
  })
})

interface ManagedPluginOptions<AssessError, AssessRequirements> {
  /**
   * Findings and warnings beyond the package, such as files that the plugin needs. They are
   * assessed only while the plugin applies.
   */
  readonly assess?: (
    cwd: string,
    packageJson: PackageJson
  ) => Effect.Effect<
    { readonly findings: readonly Finding[]; readonly warnings: readonly string[] },
    AssessError,
    AssessRequirements
  >
  readonly name: string
  /**
   * The lint preset that loads the plugin, such as `shadcn` for `adamantite/lint/shadcn`.
   */
  readonly preset: LintPreset
  readonly version: string
}

/**
 * A managed plugin: an Oxlint plugin package the target project installs for one lint preset. The
 * package is required only while `oxlint.config.ts` imports that preset. Other options, such as a
 * plugin's own `update` step, become methods of the integration.
 */
export function defineManagedPlugin<
  const Extensions extends object,
  AssessError = never,
  AssessRequirements = never,
>(options: ManagedPluginOptions<AssessError, AssessRequirements> & Extensions) {
  const { assess: assessMore, name, preset, version, ...extensions } = options
  const tooling = definePackageTooling({
    isRequired: (cwd) => checkImportsLintPreset(cwd, preset),
    name,
    purpose: `the \`adamantite/lint/${preset}\` preset`,
    scripts: ["check", "fix"],
    version,
  })

  return {
    ...extensions,
    ...tooling,
    assess: (cwd: string, packageJson: PackageJson) =>
      Effect.gen(function* () {
        const assessment = yield* tooling.assess(cwd, packageJson)

        if (!assessment.applicable || assessMore === undefined) {
          return assessment
        }

        const more = yield* assessMore(cwd, packageJson)

        return {
          ...assessment,
          findings: [...assessment.findings, ...more.findings],
          warnings: [...assessment.warnings, ...more.warnings],
        } satisfies IntegrationAssessment
      }),
    preset,
  }
}
