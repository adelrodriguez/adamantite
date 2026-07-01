import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import github from "#lib/integrations/ci/github.ts"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { MigrationValidationFailed } from "#lib/shared/errors.ts"
import { hasCICompatibleScripts } from "#lib/workspace/ci-scripts.ts"
import {
  checkIsSupportedPackageManager,
  getManagedScripts,
  readPackageJson,
  writePackageJson,
  MANAGED_SCRIPT_COMMANDS,
} from "#lib/workspace/package-json.ts"
import tsconfig from "#lib/workspace/tsconfig.ts"

const LEGACY_TYPECHECK_SCRIPT_COMMAND = "adamantite typecheck"

function getLegacyOxlintConfigPath() {
  return oxlint.files[1].path
}

function getGitHubWorkflowPath() {
  return github.files[0].path
}

function migrateLegacyTypecheckScriptPackageJson(packageJson: PackageJson) {
  const scripts = { ...packageJson.scripts }
  const typecheckScript = scripts.typecheck

  if (typecheckScript !== LEGACY_TYPECHECK_SCRIPT_COMMAND) {
    return {
      migrated: false,
      packageJson,
    }
  }

  delete scripts.typecheck
  scripts.check ??= MANAGED_SCRIPT_COMMANDS.check

  return {
    migrated: true,
    packageJson: {
      ...packageJson,
      scripts,
    } as PackageJson,
  }
}

export default defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const packageJson = yield* readPackageJson(context.cwd)
      const { migrated } = migrateLegacyTypecheckScriptPackageJson(packageJson)

      if (!migrated) {
        return { applicable: false, warnings: [] }
      }

      return {
        applicable: true,
        summary:
          "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together.",
        warnings: [],
      }
    }),
  files: [
    "package.json",
    oxlint.config,
    getLegacyOxlintConfigPath(),
    tsconfig.config,
    getGitHubWorkflowPath(),
  ],
  id: "legacy-typecheck-script",
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const dependencyInstaller = yield* DependencyInstaller
      const spinner = prompter.spinner()

      const runMigration = Effect.gen(function* () {
        const packageJson = yield* readPackageJson(context.cwd)
        const migratedPackageJson = migrateLegacyTypecheckScriptPackageJson(packageJson)

        if (!migratedPackageJson.migrated) {
          return "noop" as const
        }

        yield* writePackageJson(context.cwd, migratedPackageJson.packageJson)

        const oxlintState = yield* oxlint.exists(context.cwd)

        if (oxlintState.active === null) {
          yield* oxlint.create(context.cwd)
        } else if (oxlintState.active.format === "ts") {
          yield* oxlint.update(context.cwd)
        }

        const hasTypescriptConfig = yield* tsconfig.exists(context.cwd)
        yield* hasTypescriptConfig ? tsconfig.update(context.cwd) : tsconfig.create(context.cwd)

        const workflowExists = yield* github.exists(context.cwd)
        const managedScripts = getManagedScripts(migratedPackageJson.packageJson)

        if (workflowExists && hasCICompatibleScripts(managedScripts)) {
          const detectedPackageManager = yield* dependencyInstaller.detectPackageManager(
            context.cwd
          )

          if (
            detectedPackageManager &&
            checkIsSupportedPackageManager(detectedPackageManager.name)
          ) {
            const packageManagerName = detectedPackageManager.name
            const workflowSpinner = prompter.spinner()
            workflowSpinner.start("Updating GitHub Actions workflow...")
            yield* github
              .update(context.cwd, {
                packageManager: packageManagerName,
                scripts: managedScripts,
              })
              .pipe(
                Effect.onExit((exit) =>
                  Effect.sync(() => {
                    workflowSpinner.stop(
                      Exit.match(exit, {
                        onFailure: () => "Failed to update GitHub Actions workflow.",
                        onSuccess: () => "GitHub Actions workflow updated successfully",
                      })
                    )
                  })
                )
              )
          } else if (detectedPackageManager) {
            yield* prompter.log.warning(
              `\`${detectedPackageManager.name}\` is not a supported package manager for CI workflow generation, so the GitHub Actions workflow was not updated.`
            )
          } else {
            yield* prompter.log.warning(
              "Could not detect a package manager, so the GitHub Actions workflow was not updated."
            )
          }
        }

        return "migrated" as const
      })

      spinner.start("Migrating `typecheck` script to unified `check` command...")

      yield* runMigration.pipe(
        Effect.onExit((exit) =>
          Effect.sync(() => {
            spinner.stop(
              Exit.match(exit, {
                onFailure: () => "Legacy `typecheck` script migration failed.",
                onSuccess: (status) =>
                  status === "noop"
                    ? "No migration needed."
                    : "Legacy `typecheck` script migrated to `check` successfully.",
              })
            )
          })
        ),
        Effect.asVoid
      )
    }),
  tags: ["update"],
  title: "Legacy typecheck script",
  validate: (context) =>
    Effect.gen(function* () {
      const packageJson = yield* readPackageJson(context.cwd)

      if (packageJson.scripts?.typecheck === LEGACY_TYPECHECK_SCRIPT_COMMAND) {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-typecheck-script",
          reason: "The legacy `typecheck` script is still present in `package.json`.",
        })
      }

      const oxlintState = yield* oxlint.exists(context.cwd)

      if (oxlintState.active?.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-typecheck-script",
          reason: `\`${oxlint.config}\` is not the active oxlint config.`,
        })
      }

      const hasTypescriptConfig = yield* tsconfig.exists(context.cwd)

      if (!hasTypescriptConfig) {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-typecheck-script",
          reason: `\`${tsconfig.config}\` is missing after the migration.`,
        })
      }
    }),
})
