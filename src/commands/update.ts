import process from "node:process"
import * as Array from "effect/Array"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { assessProject } from "#lib/assessment/index.ts"
import { removeSkillsLockEntry } from "#lib/execution/skill.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { readProject } from "#lib/project/project.ts"
import * as Setup from "#lib/setup/index.ts"
import { printFindings } from "#terminal/findings.ts"
import * as Output from "#terminal/output.ts"
import { printFileWrites, printInstalls, printScriptWrites } from "#terminal/setup.ts"

/**
 * What one step of update did. `idle` means that the step found nothing to update. A step that
 * fails while it checks for work found none, and a step that fails while it applies work found
 * some. Each failure leaves a warning, and update continues.
 */
type StepOutcome = "applied" | "applyFailed" | "checkFailed" | "idle"

const warnLockFile = (error: { readonly message: string }) =>
  Output.warning(`Could not update \`skills-lock.json\`. ${error.message}`)

export default Command.make("update").pipe(
  Command.withDescription(
    "Update managed packages and the Adamantite skill, then report setup issues"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      yield* Output.intro("💠 adamantite update")

      const project = yield* readProject(cwd)
      const assessment = yield* assessProject(project)

      // `npx skills add` records the skill in `skills-lock.json`, and `skills update` would then
      // write the same folders. Adamantite owns the copy, so the lock entry goes away.
      const lock: StepOutcome = yield* removeSkillsLockEntry(cwd).pipe(
        Effect.flatMap((removed) =>
          removed
            ? Output.info("Removed the `adamantite` entry from `skills-lock.json`.").pipe(
                Effect.as("applied" as const)
              )
            : Effect.succeed("idle" as const)
        ),
        Effect.catchTag(["FailedToParseFile", "FailedToReadFile"], (error) =>
          warnLockFile(error).pipe(Effect.as("checkFailed" as const))
        ),
        Effect.catchTag("FailedToWriteFile", (error) =>
          warnLockFile(error).pipe(Effect.as("applyFailed" as const))
        )
      )

      // A project from before the lockfile gets the selection that its files show, one time.
      const selection = yield* Option.match(project.lockfile, {
        onNone: () => Setup.inferSelection(project),
        onSome: (lockfile) => Effect.succeed(lockfile.selection),
      })

      // A project with no lockfile and no setup to record stays without one.
      const setup =
        Option.isNone(project.lockfile) && Setup.checkIsEmptySelection(selection)
          ? Option.none()
          : Option.some(yield* Setup.apply(project, selection))

      yield* printInstalls(
        Option.match(setup, { onNone: () => [], onSome: ({ installs }) => installs })
      )

      yield* printScriptWrites(
        Option.match(setup, { onNone: () => [], onSome: ({ scripts }) => scripts })
      )

      yield* printFileWrites(
        Option.match(setup, { onNone: () => [], onSome: ({ files }) => files })
      )

      // A failed package install fails the whole command.
      const packages: StepOutcome = Option.exists(setup, ({ installs }) => installs.length > 0)
        ? "applied"
        : "idle"

      const files: StepOutcome = Option.exists(
        setup,
        ({ files, scripts }) =>
          files.some(({ _tag }) => _tag !== "Kept" && _tag !== "Unchanged")
          || scripts.some(({ _tag }) => _tag !== "Unchanged")
      )
        ? "applied"
        : "idle"

      const lockfile: StepOutcome = Option.exists(setup, (result) => result.lockfile === "written")
        ? "applied"
        : "idle"

      if (lockfile === "applied") {
        yield* Output.success(
          Option.isNone(project.lockfile)
            ? `\`${LOCKFILE_PATH}\` written with the setup that the project files show. Commit it.`
            : `\`${LOCKFILE_PATH}\` updated. Commit it.`
        )
      }

      // The lockfile decides which integrations apply, so a new lockfile needs a new assessment.
      const finalAssessment =
        packages === "idle" && files === "idle" && lockfile === "idle"
          ? assessment
          : yield* assessProject(yield* readProject(cwd))

      for (const warning of Array.dedupe(finalAssessment.warnings)) {
        yield* Output.warning(warning)
      }

      const { findings } = finalAssessment

      if (findings.length > 0) {
        yield* printFindings(findings)
        yield* Output.info("Run `adamantite doctor` for the remaining repairs and an agent prompt.")
      }

      const foundWork = [packages, lock, files, lockfile].some(
        (outcome) => outcome === "applied" || outcome === "applyFailed"
      )

      if (!foundWork && findings.length === 0) {
        return "no-changes" as const
      }

      return "success" as const
    }).pipe(
      Effect.tapError(() => Output.outro("❌ Update failed")),
      Effect.tap((value) =>
        Output.outro(
          value === "no-changes" ? "✅ No managed updates were applied." : "✅ Update finished."
        )
      )
    )
  )
)
