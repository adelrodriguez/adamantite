import process from "node:process"
import * as Command from "effect/cli/Command"
import * as Effect from "effect/Effect"
import type { ToolingPackage } from "#lib/integrations/base.ts"
import { assessProject } from "#lib/assessment/index.ts"
import { findStaleSkillAgents, getSkillInstallCommand, installSkill } from "#lib/execution/skill.ts"
import { getPackageActions } from "#lib/integrations/tooling/base.ts"
import knip from "#lib/integrations/tooling/knip/index.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt/index.ts"
import oxlint from "#lib/integrations/tooling/oxlint/index.ts"
import effectTsgo from "#lib/integrations/tooling/oxlint/plugins/effect-tsgo/index.ts"
import tsgolint from "#lib/integrations/tooling/oxlint/tsgolint.ts"
import sherif from "#lib/integrations/tooling/sherif/index.ts"
import { addRootDevDependencies } from "#lib/workspace/dependency-installer.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { printFindings } from "#terminal/findings.ts"
import { Prompter } from "#terminal/prompter.ts"

// Managed plugins stay out of this fallback: a plugin is updated only while its preset is imported,
// which the assessment already covers.
const knownPackages = [
  oxlint,
  tsgolint,
  oxfmt,
  sherif,
  knip,
] as const satisfies readonly ToolingPackage[]

export default Command.make("update").pipe(
  Command.withDescription("Update Adamantite-managed dependencies and report setup findings"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter

      yield* prompter.intro("💠 adamantite update")

      const packageJson = yield* readPackageJson(cwd)
      const assessment = yield* assessProject(cwd, packageJson)
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
        yield* prompter.log.info("The following dependencies will be updated:")

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
            success: "Dependencies updated successfully",
          }
        )
        yield* prompter.log.success("Dependencies updated successfully.")

        // A named install does not run the `prepare` script, which reapplies the @effect/tsgo patch.
        if (yield* effectTsgo.detect(cwd)) {
          yield* prompter.withSpinner(() => effectTsgo.patch(cwd, { quiet: true }), {
            failure: "Failed to patch Oxlint and TypeScript. Run `adamantite prepare` to see why.",
            start: "Patching Oxlint and TypeScript with @effect/tsgo...",
            success: "Oxlint and TypeScript patched with @effect/tsgo.",
          })
        }
      }

      // The skill that init installed is a copy, so it stays at the Adamantite version that made it.
      const skillAgents = yield* findStaleSkillAgents(cwd).pipe(
        Effect.catchTag(["FailedToParseFile", "FailedToReadFile"], (error) =>
          Effect.as(
            prompter.log.warning(`Could not check the Adamantite skill. ${error.message}`),
            []
          )
        )
      )

      if (skillAgents.length > 0) {
        yield* prompter
          .withSpinner(() => installSkill(cwd, skillAgents), {
            failure: "Failed to refresh the Adamantite skill.",
            start: "Refreshing the Adamantite skill...",
            success: "Adamantite skill refreshed.",
          })
          .pipe(
            Effect.catchTag(
              ["CommandFailed", "CliNotFound", "FailedToReadFile", "PlatformError"],
              () =>
                prompter.log.warning(
                  `Run \`${getSkillInstallCommand(skillAgents)}\` to see why the skill refresh failed.`
                )
            )
          )
      }

      const finalAssessment = updates.length === 0 ? assessment : yield* assessProject(cwd)

      for (const warning of finalAssessment.warnings) {
        yield* prompter.log.warning(warning)
      }

      const findings = finalAssessment.findings

      if (findings.length > 0) {
        yield* printFindings(findings)
        yield* prompter.log.info(
          "Run `adamantite doctor` to get the combined Markdown repair prompt."
        )
      }

      if (updates.length === 0 && skillAgents.length === 0 && findings.length === 0) {
        yield* prompter.log.success("No changes needed.")
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
            value === "no-changes"
              ? "✅ Adamantite is already up to date."
              : "✅ Update completed successfully!"
          )
        })
      )
    )
  )
)
