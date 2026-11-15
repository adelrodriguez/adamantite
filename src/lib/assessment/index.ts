import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import type { Finding, PackageAction } from "#lib/integrations/base.ts"
import type { Project } from "#lib/project/project.ts"
import type { InvalidLockfile, UnsupportedLockfile } from "#lib/shared/errors.ts"
import { getRepairPromptTemplate } from "#lib/assessment/repair-prompt.macro.ts" with { type: "macro" }
import { getWarningReportTemplate } from "#lib/assessment/warning-report.macro.ts" with { type: "macro" }
import github from "#lib/integrations/ci/github.ts"
import zed from "#lib/integrations/editors/zed.ts"
import { integrations } from "#lib/integrations/index.ts"
import { inferSelection } from "#lib/integrations/selection.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxlintCustom from "#lib/integrations/tooling/oxlint/custom.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import { managedPlugins } from "#lib/integrations/tooling/oxlint/plugins/managed.ts"
import tsrs from "#lib/integrations/tooling/oxlint/tsrs.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import agents from "#lib/integrations/workspace/agents.ts"
import tsconfig from "#lib/integrations/workspace/tsconfig.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { fillTemplate } from "#lib/shared/template.ts"

const repairPromptTemplate = getRepairPromptTemplate()
const warningReportTemplate = getWarningReportTemplate()

/**
 * The integrations that have not moved to a folder of their own yet, assessed against a project
 * before the ones in `integrations/index.ts`. The order fixes how findings are numbered in the
 * rendered output.
 */
const managedIntegrations = [
  knip,
  oxlint,
  oxlintCustom,
  ...managedPlugins,
  sherif,
  tsrs,
  tsconfig,
  agents,
  github,
  zed,
] as const

// Without a lockfile, Doctor decides from the files that exist, so it cannot check what init set up.
const lockfileMissing: Finding = {
  currentState: `The project has no \`${LOCKFILE_PATH}\`, so Doctor decides which integrations apply from the files that exist, and cannot check a selected integration whose file is missing.`,
  goal: [
    `Run \`adamantite update\`. It writes \`${LOCKFILE_PATH}\` with the setup that the project files show.`,
    `Commit \`${LOCKFILE_PATH}\`.`,
  ],
  id: "lockfile-missing",
  integration: "lockfile",
  title: "Missing Adamantite lockfile",
}

/**
 * The assessment of a project whose lockfile does not read. The other assessments need the
 * selection, so the lockfile finding is the only one. Doctor reports it, and the commands that
 * write the lockfile fail instead, so they do not overwrite it.
 */
export function assessUnreadableLockfile(
  error: InvalidLockfile | UnsupportedLockfile
): ProjectAssessment {
  const finding = Match.valueTags(error, {
    InvalidLockfile: ({ issue, path }): Finding => ({
      currentState: `\`${path}\` does not decode as an Adamantite lockfile. ${issue}`,
      goal: [
        `Make \`${path}\` decode again, for example by resolving a merge conflict. Preserve the recorded \`selection\` and the hashes in \`written\`.`,
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "invalid-lockfile",
      integration: "lockfile",
      notes: ["Doctor reports the other findings after the lockfile decodes."],
      title: "Invalid Adamantite lockfile",
    }),
    UnsupportedLockfile: ({ path, schemaVersion, version }): Finding => ({
      currentState: Option.match(version, {
        onNone: () =>
          `\`${path}\` has schema version ${JSON.stringify(schemaVersion)}, which a newer Adamantite version wrote.`,
        onSome: (writer) =>
          `\`${path}\` has schema version ${JSON.stringify(schemaVersion)}, which Adamantite ${writer} wrote.`,
      }),
      goal: [
        Option.match(version, {
          onNone: () =>
            "Update the project's `adamantite` dependency to the version that wrote the lockfile, or newer, and install it.",
          onSome: (writer) =>
            `Update the project's \`adamantite\` dependency to ${writer} or newer, and install it.`,
        }),
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "unsupported-lockfile",
      integration: "lockfile",
      notes: ["Doctor reports the other findings after the lockfile decodes."],
      title: "Unsupported Adamantite lockfile",
    }),
  })

  return { applicableIntegrations: [], findings: [finding], packageActions: [], warnings: [] }
}

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

  // Without a lockfile, an integration applies to the files that exist, which the inferred
  // selection names.
  const selection = yield* Option.match(project.lockfile, {
    onNone: () => inferSelection(project),
    onSome: (lockfile) => Effect.succeed(lockfile.selection),
  })

  const parts = yield* Effect.forEach(
    integrations.filter((integration) => integration.selected(selection)),
    (integration) =>
      integration
        .assess(project, selection)
        .pipe(Effect.map((assessment) => ({ assessment, name: integration.name }))),
    { concurrency: "unbounded" }
  )

  const applicable = [...Array.flatten(assessments), ...parts]

  // A project that Adamantite does not manage needs no lockfile.
  const lockfileFindings =
    Option.isNone(project.lockfile) && applicable.length > 0 ? [lockfileMissing] : []

  return {
    applicableIntegrations: applicable.map(({ name }) => name),
    findings: [...applicable.flatMap(({ assessment }) => assessment.findings), ...lockfileFindings],
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
