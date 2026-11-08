import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import type { Finding, PackageAction } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"
import { getRepairPromptTemplate } from "#lib/assessment/repair-prompt.macro.ts" with { type: "macro" }
import { getWarningReportTemplate } from "#lib/assessment/warning-report.macro.ts" with { type: "macro" }
import github from "#lib/integrations/ci/github.ts"
import vscode from "#lib/integrations/editors/vscode.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import oxlintCustom from "#lib/integrations/tooling/oxlint/custom.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/managed.ts"
import tsrs from "#lib/integrations/tooling/oxlint/tsrs.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import agents from "#lib/integrations/workspace/agents.ts"
import tsconfig from "#lib/integrations/workspace/tsconfig.ts"
import { fillTemplate } from "#lib/shared/template.ts"

const repairPromptTemplate = getRepairPromptTemplate()
const warningReportTemplate = getWarningReportTemplate()

/**
 * Every integration assessed against a project. The order fixes how findings are numbered in the
 * rendered output.
 */
const managedIntegrations = [
  knip,
  oxfmt,
  oxlint,
  oxlintCustom,
  ...managedPlugins,
  sherif,
  tsrs,
  tsconfig,
  agents,
  github,
  vscode,
  zed,
] as const

export interface ProjectAssessment {
  /**
   * Names of the integrations that apply to this project. Empty means nothing is managed.
   */
  readonly applicableIntegrations: readonly string[]
  /**
   * Empty means the project has converged on the managed state.
   */
  readonly findings: readonly Finding[]
  readonly packageActions: readonly PackageAction[]
  readonly warnings: readonly string[]
}

/**
 * Assess every managed integration against one read of the project. A reassessment after an agent
 * session or a dependency update reads the project again, so it sees the changes.
 */
export const assessProject = Effect.fn("assessProject")(function* (project: Project) {
  const assessments = yield* Effect.forEach(
    managedIntegrations,
    (integration) =>
      Effect.gen(function* () {
        const assessment = yield* integration.assess(project)
        return assessment.applicable ? [{ assessment, name: integration.name }] : []
      }),
    // Assessments are read-only and independent, and `forEach` keeps results in input order.
    { concurrency: "unbounded" }
  )
  const applicable = Array.flatten(assessments)

  return {
    applicableIntegrations: applicable.map(({ name }) => name),
    findings: applicable.flatMap(({ assessment }) => assessment.findings),
    packageActions: applicable.flatMap(({ assessment }) => assessment.packageActions),
    warnings: applicable.flatMap(({ assessment }) => assessment.warnings),
  } satisfies ProjectAssessment
})

/**
 * The Markdown a coding agent consumes. Findings produce the combined repair prompt with warnings
 * folded in; a warning-only assessment produces the warning report.
 */
export function renderAssessmentMarkdown(
  assessment: ProjectAssessment,
  adamantiteVersion: string
): string {
  return assessment.findings.length === 0
    ? renderWarningReport(assessment.warnings, adamantiteVersion)
    : renderRepairPrompt(assessment.findings, assessment.warnings, adamantiteVersion)
}

function renderWarningReport(warnings: readonly string[], adamantiteVersion: string): string {
  return fillTemplate(warningReportTemplate, {
    version: adamantiteVersion,
    warnings: warnings.map((warning) => `- ${warning}`).join("\n"),
  })
}

function renderRepairPrompt(
  findings: readonly Finding[],
  warnings: readonly string[],
  adamantiteVersion: string
): string {
  const sections = findings.map((finding, index) => {
    const goal = finding.goal.map((item) => `  - ${item}`).join("\n")
    const reference = finding.reference
      ? `\n- **Reference:**\n\n\`\`\`${finding.reference.language}\n${finding.reference.content.trimEnd()}\n\`\`\``
      : ""
    const notes =
      finding.notes && finding.notes.length > 0
        ? `\n- **Notes:**\n${finding.notes.map((note) => `  - ${note}`).join("\n")}`
        : ""

    return `## ${index + 1}. ${finding.title}\n\n- **Current state:** ${finding.currentState}\n- **Goal:**\n${goal}${reference}${notes}`
  })
  const warningSection =
    warnings.length > 0
      ? [
          "## Assessment warnings",
          "",
          "Review these warnings before making repairs:",
          "",
          ...warnings.map((warning) => `- ${warning}`),
          "",
          "",
        ].join("\n")
      : ""
  return fillTemplate(repairPromptTemplate, {
    findingCount: findings.length.toLocaleString("en-US"),
    findings: sections.join("\n\n"),
    version: adamantiteVersion,
    warnings: warningSection,
  })
}
