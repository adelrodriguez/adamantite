import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type {
  AssessableIntegration,
  IntegrationBase,
  IntegrationKind,
  IntegrationAssessment,
} from "#lib/integrations/base.ts"

export type ApplicableAssessment = Extract<IntegrationAssessment, { readonly applicable: true }>

export interface AssessedIntegration<I extends IntegrationBase<IntegrationKind>> {
  readonly assessment: ApplicableAssessment
  readonly integration: I
}

type AnyAssessableIntegration = IntegrationBase<IntegrationKind> & AssessableIntegration

const collect = Effect.fn("collectApplicableAssessments")(
  (integrations: readonly AnyAssessableIntegration[], cwd: string) =>
    Effect.forEach((integration: AnyAssessableIntegration) =>
      integration
        .assess(cwd)
        .pipe(
          Effect.map((assessment) =>
            assessment.applicable
              ? Option.some({ assessment, integration })
              : Option.none<AssessedIntegration<AnyAssessableIntegration>>()
          )
        )
    )(integrations).pipe(Effect.map((optionalAssessments) => Array.getSomes(optionalAssessments)))
)

export function collectApplicableAssessments<const I extends AnyAssessableIntegration>(
  integrations: readonly I[],
  cwd: string
): Effect.Effect<
  Array<AssessedIntegration<I>>,
  Effect.Error<ReturnType<I["assess"]>>,
  Effect.Services<ReturnType<I["assess"]>>
>
export function collectApplicableAssessments(
  integrations: readonly AnyAssessableIntegration[],
  cwd: string
) {
  return collect(integrations, cwd)
}
