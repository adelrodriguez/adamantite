import * as Effect from "effect/Effect"
import github from "#lib/integrations/ci/github.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { collectApplicableAssessments } from "#lib/shared/assessment.ts"
import { collectFindings } from "#lib/shared/findings.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

/**
 * Every integration Doctor and update assess. The order fixes how findings are numbered in the
 * rendered output.
 */
export const managedIntegrations = [
  knip,
  oxfmt,
  oxlint,
  sherif,
  tsgolint,
  tsconfig,
  github,
  zed,
] as const

// Reads package.json on every call so a reassessment after an agent session or a
// dependency update sees the mutations.
export const assessManagedIntegrations = (cwd: string) =>
  Effect.gen(function* () {
    const assessments = yield* collectApplicableAssessments(managedIntegrations, cwd)
    const warnings = assessments.flatMap(({ assessment }) => assessment.warnings)
    return { assessments, findings: collectFindings(assessments), warnings }
  })
