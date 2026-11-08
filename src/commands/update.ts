import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import type { ToolingPackage } from "#lib/integrations/base.ts"
import { assessProject } from "#lib/assessment/index.ts"
import { findStaleSkillFolders, removeSkillsLockEntry, writeSkill } from "#lib/execution/skill.ts"
import { getPackageActions } from "#lib/integrations/tooling/base.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import tsrs from "#lib/integrations/tooling/oxlint/tsrs.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { addRootDevDependencies } from "#lib/workspace/dependency-installer.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { readProject } from "#lib/workspace/project.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"

// Managed plugins stay out of this fallback: a plugin is updated only while its preset is imported,
// which the assessment already covers.
const knownPackages = [
  oxlint,
  tsrs,
  oxfmt,
  sherif,
  knip,
] as const satisfies readonly ToolingPackage[]

export default Command.make("update").pipe(
  Command.withDescription(
    "Update managed packages and the Adamantite skill, then report setup issues"
  ),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter

      yield* prompter.intro("💠 adamantite update")

      const packageJson = yield* readPackageJson(cwd)
      const assessment = yield* assessProject(yield* readProject(cwd, packageJson))
      const packageActions = assessment.packageActions
      const coveredPackages = new Set(packageActions.map((action) => action.package))
      const updates = [
        ...packageActions,
        // A known package that the project does not install stays uninstalled.
        ...knownPackages
          .filter((pkg) => !coveredPackages.has(pkg.name))
          .flatMap((pkg) => getPackageActions(packageJson, pkg, "Adamantite"))
          .filter((action) => action.type === "update_package"),
      ]

      if (updates.length > 0) {
        yield* prompter.log.info("Packages to install or update:")

        for (const action of updates) {
          const currentVersion =
            action.type === "install_package" ? "not installed" : action.currentVersion

          yield* prompter.log.info(
            `  ${action.package}: ${currentVersion} → ${action.targetVersion}`
          )
        }

        yield* prompter.withSpinner(
          () =>
            addRootDevDependencies(
              cwd,
              updates.map((action) => `${action.package}@${action.targetVersion}`)
            ),
          {
            failure: "Failed to update dependencies",
            start: "Updating dependencies...",
            success: "Dependencies updated.",
          }
        )
      }

      // The skill that init wrote is a copy, so it stays at the Adamantite version that wrote it.
      const staleSkillFolders = yield* findStaleSkillFolders(cwd).pipe(
        Effect.catchTag("FailedToReadFile", (error) =>
          Effect.as(
            prompter.log.warning(`Could not check the Adamantite skill. ${error.message}`),
            []
          )
        )
      )

      if (staleSkillFolders.length > 0) {
        yield* prompter
          .withSpinner(() => writeSkill(cwd, staleSkillFolders), {
            failure: "Failed to refresh the Adamantite skill.",
            start: "Refreshing the Adamantite skill...",
            success: "Adamantite skill refreshed.",
          })
          .pipe(
            Effect.catchTag(
              ["FailedToCreateDirectory", "FailedToReadFile", "FailedToWriteFile"],
              (error) =>
                prompter.log.warning(`Could not refresh the Adamantite skill. ${error.message}`)
            )
          )
      }

      // `npx skills add` records the skill in `skills-lock.json`, and `skills update` would then
      // write the same folders. Adamantite owns the copy, so the lock entry goes away.
      const removedLockEntry = yield* removeSkillsLockEntry(cwd).pipe(
        Effect.tap((removed) =>
          removed
            ? prompter.log.info("Removed the `adamantite` entry from `skills-lock.json`.")
            : Effect.void
        ),
        Effect.catchTag(["FailedToParseFile", "FailedToReadFile", "FailedToWriteFile"], (error) =>
          Effect.as(
            prompter.log.warning(`Could not update \`skills-lock.json\`. ${error.message}`),
            false
          )
        )
      )

      const finalAssessment =
        updates.length === 0 ? assessment : yield* assessProject(yield* readProject(cwd))

      for (const warning of finalAssessment.warnings) {
        yield* prompter.log.warning(warning)
      }

      const findings = finalAssessment.findings

      if (findings.length > 0) {
        yield* printFindings(findings)
        yield* prompter.log.info(
          "Run `adamantite doctor` for the remaining repairs and an agent prompt."
        )
      }

      if (
        updates.length === 0
        && staleSkillFolders.length === 0
        && !removedLockEntry
        && findings.length === 0
      ) {
        return "no-changes" as const
      }

      return "success" as const
    }).pipe(
      Effect.tapError(() =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.outro("❌ Update failed")
        })
      ),
      Effect.tap((value) =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          yield* prompter.outro(
            value === "no-changes" ? "✅ No managed updates were applied." : "✅ Update finished."
          )
        })
      )
    )
  )
)
