import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Match from "effect/Match"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import type { Project } from "#lib/project/project.ts"
import type { InvalidLockfile, UnsupportedLockfile } from "#lib/shared/errors.ts"
import { getRepairPromptTemplate } from "#lib/assessment/repair-prompt.macro.ts" with { type: "macro" }
import { getWarningReportTemplate } from "#lib/assessment/warning-report.macro.ts" with { type: "macro" }
import { Finding, PackageAction } from "#lib/integrations/base.ts"
import { integrations } from "#lib/integrations/index.ts"
import oxlintCustom from "#lib/integrations/oxlint/custom.ts"
import { managedPlugins } from "#lib/integrations/oxlint/plugins/managed.ts"
import tsrs from "#lib/integrations/oxlint/tsrs.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import { readProject } from "#lib/project/project.ts"
import { Selection } from "#lib/project/selection.ts"
import { fillTemplate } from "#lib/shared/template.ts"

const repairPromptTemplate = getRepairPromptTemplate()
const warningReportTemplate = getWarningReportTemplate()

/**
 * The integrations that have not moved to a folder of their own yet, assessed against a project
 * before the ones in `integrations/index.ts`. The order fixes how findings are numbered in the
 * rendered output.
 */
const managedIntegrations = [oxlintCustom, ...managedPlugins, tsrs] as const

/**
 * The assessment of a project without a lockfile. The other assessments need the selection that
 * `init` records, so this finding is the only one.
 */
const lockfileMissing: ProjectAssessment = {
  applicableIntegrations: [],
  findings: [
    {
      currentState: `The project has no \`${LOCKFILE_PATH}\`, so Adamantite does not know what to check.`,
      goal: [
        `Run \`adamantite init\`. It sets up the project and writes \`${LOCKFILE_PATH}\`.`,
        `Commit \`${LOCKFILE_PATH}\`.`,
      ],
      id: "lockfile-missing",
      integration: "lockfile",
      notes: [
        "Adamantite versions before the lockfile did not write one. `init` keeps each file that differs from what it would write, and Doctor then reports the changes that break the setup.",
      ],
      title: "Missing Adamantite lockfile",
    },
  ],
  packageActions: [],
  selection: null,
  warnings: [],
}

/**
 * The assessment of a project whose lockfile does not read. The other assessments need the
 * selection, so the lockfile finding is the only one. Doctor reports it, and the commands that
 * write the lockfile fail instead, so they do not overwrite it.
 */
function assessUnreadableLockfile(error: InvalidLockfile | UnsupportedLockfile): ProjectAssessment {
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

  return {
    applicableIntegrations: [],
    findings: [finding],
    packageActions: [],
    selection: null,
    warnings: [],
  }
}

/**
 * The assessment of a project that does not declare `adamantite`. The other assessments need the
 * installed version, so this finding is the only one.
 */
const notInstalled: ProjectAssessment = {
  applicableIntegrations: [],
  findings: [
    {
      currentState:
        "The root `package.json` does not declare `adamantite`, so the project runs no installed Adamantite version.",
      goal: [
        "Add `adamantite` to the `devDependencies` of the root `package.json` with the project's package manager, and install it.",
        "Run `adamantite doctor` again. It must not report this finding.",
      ],
      id: "adamantite-not-installed",
      integration: "adamantite",
      notes: ["Doctor reports the other findings after the project installs Adamantite."],
      title: "Adamantite is not installed",
    },
  ],
  packageActions: [],
  selection: null,
  warnings: [],
}

/**
 * What an assessment found in a project. `doctor --json` prints it as this schema encodes it.
 */
export const ProjectAssessment = Schema.Struct({
  /**
   * Names of the integrations that apply to this project. Empty means nothing is managed.
   */
  applicableIntegrations: Schema.Array(Schema.String),
  /**
   * Empty means the project has reached the latest supported state.
   */
  findings: Schema.Array(Finding),
  packageActions: Schema.Array(PackageAction),
  /**
   * The selection that the assessment checked, from the lockfile. Null when the project has no
   * lockfile, or when it does not read.
   */
  selection: Schema.NullOr(Selection),
  warnings: Schema.Array(Schema.String),
})

export type ProjectAssessment = typeof ProjectAssessment.Type

/**
 * Assess every managed integration against one read of the project. A reassessment after an agent
 * session or a dependency update reads the project again, so it sees the changes.
 */
export const assessProject = Effect.fn("assessProject")(function* (project: Project) {
  if (Option.isNone(project.lockfile)) {
    return lockfileMissing
  }

  const { selection } = project.lockfile.value

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

  const parts = yield* Effect.forEach(
    integrations.filter((integration) => integration.selected(selection)),
    (integration) =>
      integration
        .assess(project, selection)
        .pipe(Effect.map((assessment) => ({ assessment, name: integration.name }))),
    { concurrency: "unbounded" }
  )

  const applicable = [...Array.flatten(assessments), ...parts]

  return {
    applicableIntegrations: applicable.map(({ name }) => name),
    findings: applicable.flatMap(({ assessment }) => assessment.findings),
    packageActions: applicable.flatMap(({ assessment }) => assessment.packageActions),
    selection,
    warnings: applicable.flatMap(({ assessment }) => assessment.warnings),
  } satisfies ProjectAssessment
})

/**
 * The assessment that Doctor reports for the project at `cwd`, from a new read of it. A project
 * that does not declare `adamantite`, or whose lockfile does not read, gets one finding for it, so
 * a coding agent can repair it.
 */
export const readAssessment = Effect.fn("readAssessment")(function* (cwd: string) {
  // The root manifest decides whether Doctor assesses at all, so a project without Adamantite gets
  // the install finding even when its workspace packages do not read.
  const packageJson = yield* readPackageJson(cwd)

  if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
    return notInstalled
  }

  return yield* readProject(cwd).pipe(
    Effect.flatMap(assessProject),
    Effect.catchTag(["InvalidLockfile", "UnsupportedLockfile"], (error) =>
      Effect.succeed(assessUnreadableLockfile(error))
    )
  )
})

/**
 * The Markdown a coding agent consumes. Findings produce the combined repair prompt with warnings
 * folded in; a warning-only assessment produces the warning report.
 */
export function renderAssessmentMarkdown(
  assessment: Pick<ProjectAssessment, "findings" | "warnings">,
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
