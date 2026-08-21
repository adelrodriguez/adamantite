import process from "node:process"
import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import * as Flag from "effect/unstable/cli/Flag"
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner"
import { offerFindingActions } from "#commands/finding-actions.ts"
import github from "#lib/integrations/ci/github.ts"
import zed from "#lib/integrations/editors/zed.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { collectApplicableAssessments } from "#lib/shared/assessment.ts"
import { CommandFailed } from "#lib/shared/errors.ts"
import { collectFindings } from "#lib/shared/findings.ts"
import { getPackageVersion } from "#lib/shared/version.macro.ts" with { type: "macro" }
import { readPackageJson } from "#lib/workspace/package-json.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"
import { printTitle } from "#terminal/title.ts"

const fix = Flag.boolean("fix").pipe(
  Flag.withDescription("Removed. Run doctor and follow its findings")
)

const integrations = [knip, oxfmt, oxlint, sherif, tsgolint, tsconfig, github, zed] as const
const version = getPackageVersion()

function failDoctor() {
  return new CommandFailed({
    command: "doctor",
    exitCode: ChildProcessSpawner.ExitCode(1),
  })
}

export default Command.make("doctor", { fix }).pipe(
  Command.withDescription("Assess Adamantite-managed integrations in the current project"),
  Command.withHandler(({ fix }) =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter

      yield* printTitle()
      yield* prompter.intro("💠 adamantite doctor")

      if (fix) {
        yield* prompter.log.error(
          "`doctor --fix` has been removed. Run `adamantite doctor` and follow the reported goal criteria."
        )
        yield* prompter.outro("❌ Doctor did not run")
        return yield* failDoctor()
      }

      const packageJson = yield* readPackageJson(cwd)

      if (!packageJson.devDependencies?.adamantite && !packageJson.dependencies?.adamantite) {
        yield* prompter.log.warning(
          "`adamantite` is not installed in this project. Install it before running `adamantite doctor`."
        )
        yield* prompter.outro("⚠️ Doctor found issues.")
        return yield* failDoctor()
      }

      const collectCurrentAssessments = () =>
        readPackageJson(cwd).pipe(
          Effect.flatMap((manifest) => collectApplicableAssessments(integrations, cwd, manifest))
        )
      const assessments = yield* collectApplicableAssessments(integrations, cwd, packageJson)

      for (const { assessment } of assessments) {
        for (const warning of assessment.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      const findings = collectFindings(assessments)

      if (assessments.length === 0) {
        yield* prompter.log.success("No applicable integrations found.")
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      if (findings.length === 0) {
        yield* prompter.log.success("No issues found.")
        yield* prompter.outro("✅ Doctor completed successfully!")
        return
      }

      yield* printFindings(findings)

      const actionResult = yield* offerFindingActions({
        adamantiteVersion: version,
        cwd,
        findings,
        reassess: () =>
          collectCurrentAssessments().pipe(
            Effect.map((currentAssessments) => collectFindings(currentAssessments))
          ),
      })

      if (actionResult.kind === "reassessed") {
        if (actionResult.findings.length === 0) {
          yield* prompter.log.success("The agent resolved every finding.")
          yield* prompter.outro("✅ Doctor completed successfully!")
          return
        }

        yield* prompter.log.warning("Findings remain after the agent run.")
        yield* printFindings(actionResult.findings)
      }

      yield* prompter.outro("⚠️ Doctor found issues.")
      return yield* failDoctor()
    })
  )
)
