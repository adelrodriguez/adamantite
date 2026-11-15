import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { Project } from "#lib/project/project.ts"
import type { Selection } from "#lib/project/selection.ts"
import { assessProject } from "#lib/assessment/index.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { readProject } from "#lib/project/project.ts"
import * as Setup from "#lib/setup/index.ts"
import { printFindings } from "#terminal/findings.ts"
import * as Output from "#terminal/output.ts"
import { printFileWrites, printInstalls, printScriptWrites } from "#terminal/setup.ts"

/**
 * Assesses the project at `cwd`, and prints the warnings and the findings, which stay
 * informational. It returns the findings.
 */
export const reportAssessment = Effect.fn("reportAssessment")(function* (cwd: string) {
  const assessment = yield* assessProject(yield* readProject(cwd))

  for (const warning of Array.dedupe(assessment.warnings)) {
    yield* Output.warning(warning)
  }

  if (assessment.findings.length > 0) {
    yield* printFindings(assessment.findings)
    yield* Output.info("Run `adamantite doctor` for the remaining repairs and an agent prompt.")
  }

  return assessment.findings
})

/**
 * The backend that `init` and `update` share once each has its selection: `Setup.apply`, then the
 * assessment of the project that it left. It prints what Setup did, then the assessment. It returns
 * whether Setup changed the project, and the findings.
 */
export const applySetup = Effect.fn("applySetup")(function* (
  project: Project,
  selection: Selection
) {
  const setup = yield* Setup.apply(project, selection)

  yield* printInstalls(setup.installs)
  yield* printScriptWrites(setup.scripts)
  yield* printFileWrites(setup.files)

  yield* setup.lockfile === "unchanged"
    ? Output.info(`\`${LOCKFILE_PATH}\` already records this setup.`)
    : Output.success(
        Option.isNone(project.lockfile)
          ? `\`${LOCKFILE_PATH}\` written. Commit it with the setup.`
          : `\`${LOCKFILE_PATH}\` updated. Commit it.`
      )

  // The lockfile decides which integrations apply, so the assessment reads the project again.
  const findings = yield* reportAssessment(project.cwd)

  const changed =
    setup.installs.length > 0
    || setup.lockfile === "written"
    || setup.scripts.some(({ _tag }) => _tag !== "Unchanged")
    || setup.files.some(({ _tag }) => _tag !== "Kept" && _tag !== "Unchanged")

  return { changed, findings }
})
