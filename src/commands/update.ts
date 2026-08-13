import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Result from "effect/Result"
import * as Command from "effect/unstable/cli/Command"
import type { ToolingPackage } from "#lib/integrations/base.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { runMigration } from "#lib/migrations/base.ts"
import { migrations } from "#lib/migrations/index.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { collectApplicableAssessments } from "#lib/shared/assessment.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"

const integrations = [oxlint, tsgolint, oxfmt, sherif, knip] as const
const knownPackages = [
  oxlint,
  tsgolint,
  oxfmt,
  sherif,
  knip,
] as const satisfies readonly ToolingPackage[]

type PackageUpdate = {
  readonly currentVersion: string
  readonly name: string
  readonly targetVersion: string
}

function getFallbackPackageUpdates(
  packageJson: PackageJson,
  coveredPackages: ReadonlySet<string>
): PackageUpdate[] {
  return Array.filterMap(knownPackages, (pkg) => {
    if (coveredPackages.has(pkg.name)) {
      return Result.failVoid
    }

    const dependency =
      packageJson.devDependencies?.[pkg.name] ?? packageJson.dependencies?.[pkg.name]

    return dependency && normalizeDependencyVersion(dependency) !== pkg.version
      ? Result.succeed({
          currentVersion: dependency,
          name: pkg.name,
          targetVersion: pkg.version,
        })
      : Result.failVoid
  })
}

export default Command.make("update").pipe(
  Command.withDescription("Run applicable Adamantite migrations and update managed dependencies"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const dependencyInstaller = yield* DependencyInstaller
      const migrationContext = { cwd }

      yield* printTitle()

      yield* prompter.intro("💠 adamantite update")

      const collectAssessments = () => collectApplicableAssessments(integrations, cwd)

      const assessments = yield* collectAssessments()

      const migrationChecks = yield* pipe(
        migrations.filter((candidate) => candidate.tags.includes("update")),
        Effect.forEach((migration) =>
          migration.check(migrationContext).pipe(Effect.map((result) => ({ migration, result })))
        )
      )

      // Assessments and migration checks derive warnings from the same detected state, so a Set
      // collapses the overlap.
      const warnings = new Set([
        ...assessments.flatMap(({ assessment }) => assessment.warnings),
        ...migrationChecks.flatMap(({ result }) => result.warnings),
      ])

      for (const warning of warnings) {
        yield* prompter.log.warning(warning)
      }

      const migratedIds: string[] = []

      for (const { migration, result } of migrationChecks) {
        if (result.status !== "needed") {
          continue
        }

        yield* prompter.log.info(result.summary)

        yield* runMigration(migration, migrationContext, {
          onRestore: prompter.log.warning(
            `Migration "${migration.title}" failed, restoring files...`
          ),
        })
        migratedIds.push(migration.id)
      }

      if (migratedIds.length > 0) {
        yield* prompter.log.success("Migrations ran successfully.")
      }

      const packageJson = yield* readPackageJson(cwd)
      const postMigrationAssessments = yield* collectAssessments()
      const postMigrationActions = postMigrationAssessments.flatMap(
        ({ assessment }) => assessment.actions
      )
      const doctorFollowUpActions = postMigrationActions.filter(
        (action) =>
          action.type === "create_config" ||
          action.type === "update_config" ||
          action.type === "manual_fix"
      )
      const packageUpdates = Array.filterMap(postMigrationActions, (action) => {
        switch (action.type) {
          case "install_package":
            return Result.succeed({
              currentVersion: "not installed",
              name: action.package,
              targetVersion: action.targetVersion,
            })
          case "update_package":
            return Result.succeed({
              currentVersion: action.currentVersion,
              name: action.package,
              targetVersion: action.targetVersion,
            })
          default:
            return Result.failVoid
        }
      })
      const coveredPackages = new Set(packageUpdates.map((update) => update.name))
      const updates = [
        ...packageUpdates,
        ...getFallbackPackageUpdates(packageJson, coveredPackages),
      ]

      if (updates.length > 0) {
        yield* prompter.log.info("The following dependencies will be updated:")

        for (const dep of updates) {
          yield* prompter.log.info(`  ${dep.name}: ${dep.currentVersion} → ${dep.targetVersion}`)
        }

        yield* prompter.withSpinner(
          () =>
            dependencyInstaller.addDevDependencies(
              updates.map((dep) => `${dep.name}@${dep.targetVersion}`),
              cwd,
              { silent: true }
            ),
          {
            failure: "Failed to update dependencies",
            start: "Updating dependencies...",
            success: "Dependencies updated successfully",
          }
        )
        yield* prompter.log.success("Dependencies updated successfully.")
      }

      if (doctorFollowUpActions.length > 0) {
        yield* prompter.log.warning(
          "Some configuration follow-up belongs to `adamantite doctor --fix`."
        )

        for (const action of doctorFollowUpActions) {
          yield* prompter.log.warning(`Doctor follow-up: ${action.description}`)
        }
      }

      if (migratedIds.length === 0 && updates.length === 0 && doctorFollowUpActions.length === 0) {
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
          switch (value) {
            case "no-changes":
              yield* prompter.outro("✅ Adamantite is already up to date.")
              break
            case "success":
              yield* prompter.outro("✅ Update completed successfully!")
              break
            default:
              break
          }
        })
      )
    )
  )
)
