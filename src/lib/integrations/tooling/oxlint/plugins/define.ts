import * as Effect from "effect/Effect"
import type { Finding, IntegrationAssessment } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"
import { definePackageTooling } from "#lib/integrations/tooling/base.ts"
import { checkImportsLintPreset, type LintPreset } from "#lib/integrations/tooling/oxlint/config.ts"

interface ManagedPluginOptions<AssessError, AssessRequirements> {
  /**
   * Findings and warnings beyond the package, such as files that the plugin needs. They are
   * assessed only while the plugin applies.
   */
  readonly assess?: (
    project: Project
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
    isRequired: ({ lintConfig }) => checkImportsLintPreset(lintConfig, preset),
    name,
    purpose: `the \`adamantite/lint/${preset}\` preset`,
    scripts: ["check", "fix"],
    version,
  })

  return {
    ...extensions,
    ...tooling,
    assess: (project: Project) =>
      Effect.gen(function* () {
        const assessment = yield* tooling.assess(project)

        if (!assessment.applicable || assessMore === undefined) {
          return assessment
        }

        const more = yield* assessMore(project)

        return {
          ...assessment,
          findings: [...assessment.findings, ...more.findings],
          warnings: [...assessment.warnings, ...more.warnings],
        } satisfies IntegrationAssessment
      }),
    preset,
  }
}
