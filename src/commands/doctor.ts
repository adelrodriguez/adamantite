import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import {
  ProjectAssessment,
  readAssessment,
  renderAssessmentMarkdown,
} from "#lib/assessment/index.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import * as Mode from "#terminal/mode.ts"
import * as Output from "#terminal/output.ts"
import * as Resolution from "#terminal/resolution.ts"

const version = getPackageVersion()

export const Report = Schema.Struct({
  schemaVersion: Schema.Literal(1),
  ...ProjectAssessment.fields,
})

export default Command.make("doctor", { json: Mode.json }).pipe(
  Command.withDescription("Check Adamantite setup and report what needs repair"),
  Command.withHandler(({ json }) =>
    Effect.gen(function* () {
      yield* Output.intro("💠 adamantite doctor")

      const assessment = yield* readAssessment()

      yield* Resolution.offer({
        command: "doctor",
        document: Output.json(Report, { schemaVersion: 1, ...assessment }),
        message: "How do you want to resolve these findings?",
        prompt: renderAssessmentMarkdown(assessment, version),
        subject: "findings",
        verify: Effect.map(readAssessment(), Resolution.fromAssessment),
        work: Resolution.Repair({ remaining: Resolution.fromAssessment(assessment) }),
      })

      yield* Output.outro("✅ Doctor finished.")
    }).pipe(Mode.provide({ json }))
  )
)
