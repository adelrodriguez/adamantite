import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type {
  AssessableIntegration,
  Finding,
  IntegrationAssessment,
  IntegrationBase,
  IntegrationKind,
  PackageAction,
} from "#lib/integrations/base.ts"
import github from "#lib/integrations/ci/github.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

/**
 * Every integration assessed against a project. The order fixes how findings are numbered in the
 * rendered output.
 */
const managedIntegrations = [knip, oxfmt, oxlint, sherif, tsgolint, tsconfig, github, zed] as const

type ApplicableAssessment = Extract<IntegrationAssessment, { readonly applicable: true }>

type AnyAssessableIntegration = IntegrationBase<IntegrationKind> & AssessableIntegration

interface NamedAssessment {
  readonly assessment: ApplicableAssessment
  readonly name: string
}

const collect = Effect.fn("collectApplicableAssessments")(function* (
  integrations: readonly AnyAssessableIntegration[],
  cwd: string,
  packageJson: PackageJson
) {
  return yield* Effect.forEach(
    integrations,
    (integration) =>
      integration
        .assess(cwd, packageJson)
        .pipe(
          Effect.map((assessment) =>
            assessment.applicable
              ? Option.some({ assessment, name: integration.name })
              : Option.none<NamedAssessment>()
          )
        ),
    // Assessments are read-only and independent, and `forEach` keeps results in input order.
    { concurrency: "unbounded" }
  ).pipe(Effect.map((optionalAssessments) => Array.getSomes(optionalAssessments)))
})

// The overload recovers each integration's precise error and requirement types, which
// direct `Effect.forEach` inference loses over the heterogeneous registry tuple.
function collectApplicable<const I extends AnyAssessableIntegration>(
  integrations: readonly I[],
  cwd: string,
  packageJson: PackageJson
): Effect.Effect<
  NamedAssessment[],
  Effect.Error<ReturnType<I["assess"]>>,
  Effect.Services<ReturnType<I["assess"]>> | FileSystem.FileSystem | Path.Path
>
function collectApplicable(
  integrations: readonly AnyAssessableIntegration[],
  cwd: string,
  packageJson: PackageJson
) {
  return collect(integrations, cwd, packageJson)
}

/**
 * The complete result of assessing a project against every managed integration.
 */
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
 * Assess every managed integration. Reads `package.json` unless a parsed manifest is provided, so a
 * reassessment after an agent session or dependency update sees the mutations.
 */
export const assessProject = Effect.fn("assessProject")(function* (
  cwd: string,
  manifest?: PackageJson
) {
  const packageJson = manifest ?? (yield* readPackageJson(cwd))
  const applicable = yield* collectApplicable(managedIntegrations, cwd, packageJson)

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
  return [
    "# Adamantite doctor warnings",
    "",
    `This project uses Adamantite ${adamantiteVersion} to manage linting, formatting, and type tooling.`,
    "`adamantite doctor` found no repair findings, but reported these warnings:",
    "",
    ...warnings.map((warning) => `- ${warning}`),
    "",
  ].join("\n")
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
          "Account for these warnings while fixing the findings:",
          "",
          ...warnings.map((warning) => `- ${warning}`),
          "",
        ]
      : []

  return [
    "# Adamantite doctor findings",
    "",
    `This project uses Adamantite ${adamantiteVersion} to manage linting, formatting, and type tooling.`,
    `\`adamantite doctor\` found ${findings.length} issue(s). Fix them so that \`adamantite doctor\` exits 0.`,
    "Before editing, make sure the working tree is clean or the user has accepted the risk.",
    "",
    ...warningSection,
    sections.join("\n\n"),
    "",
    "## Verify",
    "",
    "Run `adamantite doctor`. All findings above must be gone and it must exit 0.",
    "Do not suppress or work around checks; fix the underlying state.",
    "",
  ].join("\n")
}
