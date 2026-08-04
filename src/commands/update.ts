import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Command from "effect/unstable/cli/Command"
import type { IntegrationAssessment, ToolingPackage } from "#lib/integrations/base.ts"
import type { Migration, MigrationCheckResult } from "#lib/migrations/base.ts"
import { isApplicableAssessment } from "#lib/integrations/base.ts"
import knip from "#lib/integrations/tooling/knip.ts"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import sherif from "#lib/integrations/tooling/sherif.ts"
import tsgolint from "#lib/integrations/tooling/tsgolint.ts"
import { runMigration } from "#lib/migrations/base.ts"
import { assessmentDrivenMigrationIntegrationById, migrations } from "#lib/migrations/index.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
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

type ApplicableAssessment = {
  readonly assessment: Extract<IntegrationAssessment, { readonly applicable: true }>
  readonly integration: (typeof integrations)[number]
}

type PackageUpdate = {
  readonly currentVersion: string
  readonly name: string
  readonly targetVersion: string
}

function getFallbackPackageUpdates(packageJson: PackageJson, coveredPackages: ReadonlySet<string>) {
  const updates: PackageUpdate[] = []

  for (const pkg of knownPackages) {
    if (coveredPackages.has(pkg.name)) {
      continue
    }

    const dependency =
      packageJson.devDependencies?.[pkg.name] ?? packageJson.dependencies?.[pkg.name]

    if (dependency && normalizeDependencyVersion(dependency) !== pkg.version) {
      updates.push({
        currentVersion: dependency,
        name: pkg.name,
        targetVersion: pkg.version,
      })
    }
  }

  return updates
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

      const collectAssessments = () =>
        Effect.forEach((integration: (typeof integrations)[number]) =>
          integration
            .assess(cwd)
            .pipe(
              Effect.map((assessment) =>
                isApplicableAssessment(assessment)
                  ? Option.some({ assessment, integration } satisfies ApplicableAssessment)
                  : Option.none<ApplicableAssessment>()
              )
            )
        )(integrations).pipe(
          Effect.map((optionalAssessments) => Array.getSomes(optionalAssessments))
        )

      const assessments = yield* collectAssessments()

      for (const { assessment } of assessments) {
        for (const warning of assessment.warnings) {
          yield* prompter.log.warning(warning)
        }
      }

      const applicableIntegrationNames = new Set(
        assessments.map(({ integration }) => integration.name)
      )
      const assessmentActions = assessments.flatMap(({ assessment }) => assessment.actions)
      const assessmentMigrationIds = new Set(
        assessmentActions
          .filter((action) => action.type === "run_migration")
          .map((action) => action.migrationId)
      )

      const fallbackMigrationAssessments: Array<{
        migration: Migration
        result: MigrationCheckResult
      }> = []

      for (const migration of migrations.filter((candidate) => candidate.tags.includes("update"))) {
        const assessmentDrivenIntegrationName =
          assessmentDrivenMigrationIntegrationById[
            migration.id as keyof typeof assessmentDrivenMigrationIntegrationById
          ]
        if (applicableIntegrationNames.has(assessmentDrivenIntegrationName)) {
          continue
        }

        const result = yield* migration.check(migrationContext)
        fallbackMigrationAssessments.push({ migration, result })
      }

      for (const assessment of fallbackMigrationAssessments) {
        for (const warning of assessment.result.warnings) {
          yield* prompter.log.warning(warning)
        }

        if (assessment.result.applicable && assessment.result.summary) {
          yield* prompter.log.info(assessment.result.summary)
        }
      }

      const migratedIds: string[] = []

      for (const migration of migrations) {
        if (!assessmentMigrationIds.has(migration.id)) {
          continue
        }

        yield* runMigration(migration, migrationContext, {
          onRestore: prompter.log.warning(
            `Migration "${migration.title}" failed, restoring files...`
          ),
        })
        migratedIds.push(migration.id)
      }

      for (const { migration, result } of fallbackMigrationAssessments) {
        if (!result.applicable || !result.summary) {
          continue
        }

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
      const doctorFollowUpActions = postMigrationAssessments
        .flatMap(({ assessment }) => assessment.actions)
        .filter(
          (action) =>
            action.type === "create_config" ||
            action.type === "update_config" ||
            action.type === "manual_fix"
        )
      const packageUpdates = postMigrationAssessments
        .flatMap(({ assessment }) => assessment.actions)
        .filter((action) => action.type === "install_package" || action.type === "update_package")
        .map((action) =>
          action.type === "install_package"
            ? {
                currentVersion: "not installed",
                name: action.package,
                targetVersion: action.targetVersion,
              }
            : {
                currentVersion: action.currentVersion,
                name: action.package,
                targetVersion: action.targetVersion,
              }
        )
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
