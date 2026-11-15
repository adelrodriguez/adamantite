import process from "node:process"
import * as Array from "effect/Array"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import type { ToolingPackage } from "#lib/integrations/base.ts"
import { assessProject } from "#lib/assessment/index.ts"
import { findStaleSkillFolders, removeSkillsLockEntry, writeSkill } from "#lib/execution/skill.ts"
import { assessPackage } from "#lib/integrations/tooling/base.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import tsrs from "#lib/integrations/tooling/oxlint/tsrs.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { addRootDevDependencies } from "#lib/project/dependency-installer.ts"
import { LOCKFILE_PATH } from "#lib/project/lockfile.ts"
import { readProject } from "#lib/project/project.ts"
import * as Setup from "#lib/setup/index.ts"
import { printFindings } from "#terminal/findings.ts"
import * as Output from "#terminal/output.ts"
import { printFileWrites } from "#terminal/setup.ts"

// Managed plugins stay out of this fallback: a plugin is updated only while its preset is imported,
// which the assessment already covers.
const knownPackages = [
  oxlint,
  tsrs,
  sherif,
  knip,
] as const satisfies readonly ToolingPackage[]

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
      const packageActions = assessment.packageActions
      const coveredPackages = new Set(packageActions.map((action) => action.package))

      // A known package that no integration action covers. One that the project does not install
      // stays uninstalled.
      const fallback = knownPackages.flatMap((pkg) =>
        coveredPackages.has(pkg.name)
          ? []
          : [assessPackage(project, pkg, "Adamantite", "adamantite")]
      )

      const updates = [
        ...packageActions,
        ...fallback
          .flatMap((pkg) => pkg.packageActions)
          .filter((action) => action.type === "update_package"),
      ]

      // A catalog entry or a specifier that update cannot change keeps its finding or warning.
      const unchanged = fallback.filter((pkg) => pkg.packageActions.length === 0)

      if (updates.length > 0) {
        yield* Output.info(
          [
            "Packages to install or update:",
            ...updates.map(
              (action) =>
                `${action.package}: ${action.type === "install_package" ? "not installed" : action.currentVersion} → ${action.targetVersion}`
            ),
          ].join("\n")
        )

        yield* addRootDevDependencies(
          cwd,
          updates.map((action) => `${action.package}@${action.targetVersion}`)
        )
        yield* Output.success("Dependencies updated.")
      }

      // A failed package update fails the whole command.
      const packages: StepOutcome = updates.length === 0 ? "idle" : "applied"

      // The skill that init wrote is a copy, so it stays at the Adamantite version that wrote it.
      const skill: StepOutcome = yield* findStaleSkillFolders(cwd).pipe(
        Effect.flatMap((folders) =>
          folders.length === 0
            ? Effect.succeed("idle" as const)
            : writeSkill(cwd, folders).pipe(
                Effect.andThen(Output.success("Adamantite skill refreshed.")),
                Effect.as("applied" as const),
                Effect.catchTag(
                  ["FailedToCreateDirectory", "FailedToReadFile", "FailedToWriteFile"],
                  (error) =>
                    Output.warning(`Could not refresh the Adamantite skill. ${error.message}`).pipe(
                      Effect.as("applyFailed" as const)
                    )
                )
              )
        ),
        Effect.catchTag("FailedToReadFile", (error) =>
          Output.warning(`Could not check the Adamantite skill. ${error.message}`).pipe(
            Effect.as("checkFailed" as const)
          )
        )
      )

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

      yield* printFileWrites(
        Option.match(setup, { onNone: () => [], onSome: ({ files }) => files })
      )

      const files: StepOutcome = Option.exists(setup, ({ files }) =>
        files.some(({ _tag }) => _tag !== "Kept" && _tag !== "Unchanged")
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

      const findingIds = new Set(finalAssessment.findings.map((finding) => finding.id))

      const warnings = Array.dedupe([
        ...finalAssessment.warnings,
        ...unchanged.flatMap((pkg) => pkg.warnings),
      ])

      for (const warning of warnings) {
        yield* Output.warning(warning)
      }

      const findings = [
        ...finalAssessment.findings,
        ...unchanged
          .flatMap((pkg) => pkg.findings)
          .filter((finding) => !findingIds.has(finding.id)),
      ]

      if (findings.length > 0) {
        yield* printFindings(findings)
        yield* Output.info("Run `adamantite doctor` for the remaining repairs and an agent prompt.")
      }

      const foundWork = [packages, skill, lock, files, lockfile].some(
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
