import process from "node:process"
import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import type { ToolingPackage } from "#lib/integrations/tooling/base.ts"
import type { Migration, MigrationCheckResult } from "#lib/migrations/base.ts"
import type { Script } from "#lib/workspace/scripts.ts"
import { knip } from "#lib/integrations/tooling/knip.ts"
import { oxfmt } from "#lib/integrations/tooling/oxfmt.ts"
import { oxlint, tsgolint } from "#lib/integrations/tooling/oxlint.ts"
import { sherif } from "#lib/integrations/tooling/sherif.ts"
import { restoreFiles, snapshotFiles } from "#lib/migrations/base.ts"
import { migrations } from "#lib/migrations/index.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"
import { getManagedScripts } from "#lib/workspace/scripts.ts"

function getRequiredPackages(scripts: Script[]) {
  const requiredPackages = new Map<string, ToolingPackage>()

  if (scripts.includes("check") || scripts.includes("fix")) {
    requiredPackages.set(oxlint.name, oxlint)
    requiredPackages.set(tsgolint.name, tsgolint)
  }

  if (scripts.includes("format")) {
    requiredPackages.set(oxfmt.name, oxfmt)
  }

  if (scripts.includes("check:monorepo") || scripts.includes("fix:monorepo")) {
    requiredPackages.set(sherif.name, sherif)
  }

  if (scripts.includes("analyze")) {
    requiredPackages.set(knip.name, knip)
  }

  return [...requiredPackages.values()]
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

      const migrationAssessments: Array<{
        migration: Migration
        result: MigrationCheckResult
      }> = []

      for (const migration of migrations.filter((m) => m.tags.includes("update"))) {
        const result = yield* migration.check(migrationContext)
        migrationAssessments.push({ migration, result })
      }

      for (const assessment of migrationAssessments) {
        for (const warning of assessment.result.warnings) {
          yield* prompter.log.warning(warning)
        }

        if (assessment.result.status === "needs_migration" && assessment.result.summary) {
          yield* prompter.log.info(assessment.result.summary)
        }
      }

      const migratedIds: string[] = []

      for (const { migration, result } of migrationAssessments) {
        if (result.status !== "needs_migration") continue

        const filePaths = migration.files ?? []
        const snapshot = yield* snapshotFiles(cwd, filePaths)

        yield* Effect.gen(function* () {
          yield* migration.migrate(migrationContext)

          if (migration.validate) {
            yield* migration.validate(migrationContext)
          }

          migratedIds.push(migration.id)
        }).pipe(
          Effect.tapError(() =>
            Effect.gen(function* () {
              yield* prompter.log.warning(
                `Migration "${migration.title}" failed, restoring files...`
              )
              yield* restoreFiles(snapshot).pipe(Effect.ignore)
            })
          )
        )
      }

      if (migratedIds.length > 0) {
        yield* prompter.log.success("Migrations ran successfully.")
      }

      const packageJson = yield* readPackageJson(cwd)
      const managedScripts = getManagedScripts(packageJson)
      const requiredPackages = getRequiredPackages(managedScripts)

      const updates: Array<{
        name: string
        currentVersion: string
        targetVersion: string
        isDevDependency: boolean
      }> = []

      for (const pkg of [oxlint, tsgolint, oxfmt, sherif, knip]) {
        const dependency = packageJson.devDependencies?.[pkg.name]

        if (dependency && normalizeDependencyVersion(dependency) !== pkg.version) {
          updates.push({
            currentVersion: dependency,
            isDevDependency: true,
            name: pkg.name,
            targetVersion: pkg.version,
          })
        }
      }

      for (const pkg of requiredPackages) {
        const dependency = packageJson.devDependencies?.[pkg.name]

        if (!dependency) {
          updates.push({
            currentVersion: "not installed",
            isDevDependency: true,
            name: pkg.name,
            targetVersion: pkg.version,
          })
        }
      }

      if (updates.length > 0) {
        yield* prompter.log.info("The following dependencies will be updated:")

        for (const dep of updates) {
          yield* prompter.log.info(`  ${dep.name}: ${dep.currentVersion} → ${dep.targetVersion}`)
        }

        const spinner = prompter.spinner()
        spinner.start("Updating dependencies...")

        yield* dependencyInstaller
          .addDevDependencies(
            updates.map((dep) => `${dep.name}@${dep.targetVersion}`),
            cwd,
            { silent: true }
          )
          .pipe(
            Effect.tapError(() =>
              Effect.sync(() => {
                spinner.stop("Failed to update dependencies")
              })
            )
          )

        spinner.stop("Dependencies updated successfully")
        yield* prompter.log.success("Dependencies updated successfully.")
      }

      if (migratedIds.length === 0 && updates.length === 0) {
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
