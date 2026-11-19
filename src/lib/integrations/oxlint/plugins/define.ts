import * as Effect from "effect/Effect"
import type { Finding, IntegrationAssessment } from "#lib/integrations/base.ts"
import type * as Project from "#lib/project/index.ts"
import type { LintPreset } from "#lib/project/selection.ts"
import { listAppliedLintPresets } from "#lib/integrations/oxlint/config.ts"
import { definePackageTooling } from "#lib/integrations/oxlint/package-tooling.ts"
import { getScriptsThatRun } from "#lib/project/package-json.ts"

interface ManagedPluginOptions<AssessError, AssessRequirements> {
  readonly assess?: (
    project: Project.Snapshot
  ) => Effect.Effect<
    { readonly findings: readonly Finding[]; readonly warnings: readonly string[] },
    AssessError,
    AssessRequirements
  >
  readonly name: string
  readonly preset: LintPreset
  readonly version: string
}

export function defineManagedPlugin<
  const Extensions extends object,
  AssessError = never,
  AssessRequirements = never,
>(options: ManagedPluginOptions<AssessError, AssessRequirements> & Extensions) {
  const { assess: assessMore, name, preset, version, ...extensions } = options

  const tooling = definePackageTooling({
    isRequired: (project) => listAppliedLintPresets(project).includes(preset),
    name,
    purpose: `the \`adamantite/lint/${preset}\` preset`,
    scripts: getScriptsThatRun("oxlint"),
    version,
  })

  return {
    ...extensions,
    ...tooling,
    assess: (project: Project.Snapshot) =>
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
