import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as ChildProcessSpawner from "effect/process/ChildProcessSpawner"
import {
  assessProject,
  renderAssessmentMarkdown,
  type ProjectAssessment,
} from "#lib/assessment/index.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readProject } from "#lib/workspace/project.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { AgentSessionEnded, chooseResolution, offerPromptCopy } from "#terminal/resolution-menu.ts"

const version = getPackageVersion()

const NOT_INSTALLED_MESSAGE =
  "`adamantite` is not installed in this project. Install it before running `adamantite doctor`."

/**
 * What Doctor found. `Unmanaged` means that no managed integration applies, and `Converged` means
 * that the applicable integrations have no finding. A converged project can still have warnings.
 */
type DoctorOutcome =
  | { readonly _tag: "Converged"; readonly assessment: ProjectAssessment }
  | { readonly _tag: "NeedsRepair"; readonly assessment: ProjectAssessment }
  | { readonly _tag: "NotInstalled" }
  | { readonly _tag: "Unmanaged" }

const {
  $match: matchOutcome,
  Converged,
  NeedsRepair,
  NotInstalled,
  Unmanaged,
} = Data.taggedEnum<DoctorOutcome>()

function classifyAssessment(assessment: ProjectAssessment): DoctorOutcome {
  if (assessment.applicableIntegrations.length === 0) {
    return Unmanaged()
  }

  return assessment.findings.length === 0 ? Converged({ assessment }) : NeedsRepair({ assessment })
}

function doctorFailed() {
  return new CommandFailed({ command: "doctor", exitCode: ChildProcessSpawner.ExitCode(1) })
}

export default Command.make("doctor").pipe(
  Command.withDescription("Check Adamantite setup and report what needs repair"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const terminal = yield* TerminalCapabilities
      const isInteractive = yield* terminal.isInteractive

      if (isInteractive) {
        yield* prompter.intro("💠 adamantite doctor")
      }

      const failWithFindings = Effect.gen(function* () {
        yield* prompter.outro("⚠️ Doctor found issues.")

        return yield* doctorFailed()
      })

      const finish = (message: string) =>
        Effect.gen(function* () {
          yield* prompter.log.success(message)
          yield* prompter.outro("✅ Doctor finished.")
        })

      // The interactive report shows each assessment warning before the outcome.
      const logWarnings = (assessment: ProjectAssessment) =>
        Effect.forEach(assessment.warnings, (warning) => prompter.log.warning(warning), {
          discard: true,
        })

      const resolveFindings = Effect.fn("resolveFindings")(function* (
        assessment: ProjectAssessment
      ) {
        yield* logWarnings(assessment)
        yield* printFindings(assessment.findings)

        const resolution = yield* chooseResolution({
          command: "Doctor",
          cwd,
          message: "How do you want to resolve these findings?",
          prompt: renderAssessmentMarkdown(assessment, version),
          subject: "findings",
        })

        if (!(resolution instanceof AgentSessionEnded)) {
          return yield* failWithFindings
        }

        const { agent } = resolution
        const after = yield* assessProject(yield* readProject(cwd))

        if (after.findings.length === 0) {
          return yield* finish(`All findings were resolved by ${agent.name}.`)
        }

        yield* prompter.log.warning(
          `Doctor still reports ${after.findings.length.toLocaleString("en-US")} unresolved ${after.findings.length === 1 ? "finding" : "findings"} after the ${agent.name} session.`
        )
        yield* printFindings(after.findings)
        yield* offerPromptCopy(renderAssessmentMarkdown(after, version))

        return yield* failWithFindings
      })

      const reportInteractive = matchOutcome({
        Converged: ({ assessment }) =>
          logWarnings(assessment).pipe(Effect.andThen(finish("No setup repairs needed."))),
        NeedsRepair: ({ assessment }) => resolveFindings(assessment),
        NotInstalled: () =>
          prompter.log.warning(NOT_INSTALLED_MESSAGE).pipe(Effect.andThen(failWithFindings)),
        Unmanaged: () =>
          finish(
            "No Adamantite-managed setup found. Run `adamantite init` to configure the project."
          ),
      })

      // Without a terminal, Doctor prints only the Markdown that an agent reads.
      const reportPlain = matchOutcome({
        Converged: ({ assessment }) =>
          assessment.warnings.length > 0
            ? prompter.message(renderAssessmentMarkdown(assessment, version))
            : Effect.void,
        NeedsRepair: ({ assessment }) =>
          prompter
            .message(renderAssessmentMarkdown(assessment, version))
            .pipe(Effect.andThen(doctorFailed())),
        NotInstalled: () =>
          prompter.message(NOT_INSTALLED_MESSAGE).pipe(Effect.andThen(doctorFailed())),
        Unmanaged: () => Effect.void,
      })

      const project = yield* readProject(cwd)
      const { packageJson } = project

      const outcome =
        packageJson.devDependencies?.adamantite || packageJson.dependencies?.adamantite
          ? classifyAssessment(yield* assessProject(project))
          : NotInstalled()

      yield* isInteractive ? reportInteractive(outcome) : reportPlain(outcome)
    }).pipe(
      Effect.catchTag("OperationCancelled", () =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.cancel("Doctor was cancelled. The findings remain.")

          return yield* doctorFailed()
        })
      )
    )
  )
)
