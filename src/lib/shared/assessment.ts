import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type {
  AssessableIntegration,
  IntegrationBase,
  IntegrationKind,
  IntegrationAssessment,
} from "#lib/integrations/base.ts"
import type { FailedToParseFile, FailedToReadFile } from "#lib/shared/errors.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"

export type ApplicableAssessment = Extract<IntegrationAssessment, { readonly applicable: true }>

export interface AssessedIntegration<I extends IntegrationBase<IntegrationKind>> {
  readonly assessment: ApplicableAssessment
  readonly integration: I
}

type AnyAssessableIntegration = IntegrationBase<IntegrationKind> & AssessableIntegration

const collect = Effect.fn("collectApplicableAssessments")(function* (
  integrations: readonly AnyAssessableIntegration[],
  cwd: string,
  manifest?: PackageJson
) {
  const packageJson = manifest ?? (yield* readPackageJson(cwd))

  return yield* Effect.forEach(
    integrations,
    (integration) =>
      integration
        .assess(cwd, packageJson)
        .pipe(
          Effect.map((assessment) =>
            assessment.applicable
              ? Option.some({ assessment, integration })
              : Option.none<AssessedIntegration<AnyAssessableIntegration>>()
          )
        ),
    // Assessments are read-only and independent, and `forEach` keeps results in input order.
    { concurrency: "unbounded" }
  ).pipe(Effect.map((optionalAssessments) => Array.getSomes(optionalAssessments)))
})

export function collectApplicableAssessments<const I extends AnyAssessableIntegration>(
  integrations: readonly I[],
  cwd: string,
  packageJson?: PackageJson
): Effect.Effect<
  Array<AssessedIntegration<I>>,
  Effect.Error<ReturnType<I["assess"]>> | FailedToParseFile | FailedToReadFile,
  Effect.Services<ReturnType<I["assess"]>> | FileSystem.FileSystem | Path.Path
>
export function collectApplicableAssessments(
  integrations: readonly AnyAssessableIntegration[],
  cwd: string,
  packageJson?: PackageJson
) {
  return collect(integrations, cwd, packageJson)
}
