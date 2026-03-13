import process from "node:process"
import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Command from "effect/unstable/cli/Command"
import type { Script } from "#lib/workspace/scripts.ts"
import { github, hasCICompatibleScripts } from "#lib/integrations/ci/github.ts"
import { knip } from "#lib/integrations/tooling/knip.ts"
import { oxfmt } from "#lib/integrations/tooling/oxfmt.ts"
import { oxlint, tsgolint } from "#lib/integrations/tooling/oxlint.ts"
import { sherif } from "#lib/integrations/tooling/sherif.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"
import { FailedToWriteFile } from "#lib/shared/errors.ts"
import { printTitle } from "#lib/shared/terminal.ts"
import { normalizeDependencyVersion, readPackageJson } from "#lib/workspace/package-json.ts"
import { typescriptConfig } from "#lib/workspace/typescript-config.ts"

const MANAGED_SCRIPT_COMMANDS = {
  analyze: "adamantite analyze",
  check: "adamantite check",
  "check:monorepo": "adamantite monorepo",
  fix: "adamantite fix",
  "fix:monorepo": "adamantite monorepo --fix",
  format: "adamantite format",
} as const satisfies Record<Script, string>

function getManagedScripts(packageJson: PackageJson): Script[] {
  const scripts = packageJson.scripts ?? {}
  const managedScripts: Script[] = []

  for (const [name, command] of Object.entries(MANAGED_SCRIPT_COMMANDS) as Array<
    [Script, string]
  >) {
    if (scripts[name] === command) {
      managedScripts.push(name)
    }
  }

  return managedScripts
}

function migrateLegacyTypecheckScript(packageJson: PackageJson) {
  const scripts = { ...packageJson.scripts }
  const typecheckScript = scripts.typecheck

  if (typecheckScript !== "adamantite typecheck") {
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

function getRequiredPackages(scripts: Script[]) {
  const requiredPackages = new Map<string, { name: string; version: string }>()

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

const writePackageJson = (cwd: string, packageJson: PackageJson) =>
  Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const packagePath = path.join(cwd, "package.json")

    yield* fs
      .writeFileString(packagePath, `${JSON.stringify(packageJson, null, 2)}\n`)
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: packagePath })))
  })

export default Command.make("update").pipe(
  Command.withDescription("Update adamantite dependencies to latest compatible versions"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const cwd = process.cwd()
      const prompter = yield* Prompter
      const dependencyInstaller = yield* DependencyInstaller
      const currentPackageJson = yield* readPackageJson(cwd)
      const oxlintState = yield* oxlint.exists(cwd)
      const workflowExists = yield* github.exists(cwd)
      const { migrated: migratedLegacyTypecheck, packageJson } =
        migrateLegacyTypecheckScript(currentPackageJson)
      const managedScripts = getManagedScripts(packageJson)
      const requiredPackages = getRequiredPackages(managedScripts)
      const hasManagedOxlintScripts =
        managedScripts.includes("check") || managedScripts.includes("fix")
      const shouldMigrateLegacyOxlint = oxlintState.format === "json"
      const typescriptExists = hasManagedOxlintScripts ? yield* typescriptConfig.exists(cwd) : false
      const shouldUpdateWorkflow = workflowExists && hasCICompatibleScripts(managedScripts)
      const shouldSetupOxlint =
        migratedLegacyTypecheck ||
        shouldMigrateLegacyOxlint ||
        (hasManagedOxlintScripts && (oxlintState.format === null || oxlintState.format === "ts"))
      const shouldSetupTypescript =
        migratedLegacyTypecheck || (hasManagedOxlintScripts && !typescriptExists)

      yield* printTitle()

      yield* prompter.intro("💠 adamantite update")

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

      if (oxlintState.hasBoth) {
        yield* prompter.log.warning(
          "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`."
        )
      }

      if (migratedLegacyTypecheck) {
        yield* prompter.log.info(
          "Migrating `typecheck` to `check` so oxlint handles linting and type diagnostics together."
        )
      }

      if (
        updates.length === 0 &&
        !shouldSetupOxlint &&
        !shouldSetupTypescript &&
        !shouldUpdateWorkflow
      ) {
        yield* prompter.log.success("All adamantite dependencies are already up to date!")
        return "no-updates" as const
      }

      if (updates.length > 0) {
        yield* prompter.log.info("The following dependencies will be updated:")

        for (const dep of updates) {
          yield* prompter.log.info(`  ${dep.name}: ${dep.currentVersion} → ${dep.targetVersion}`)
        }

        const shouldUpdate = yield* prompter.confirm({
          message: "Do you want to proceed with these updates?",
        })

        if (!shouldUpdate) {
          return "cancelled" as const
        }
      }

      if (migratedLegacyTypecheck) {
        yield* writePackageJson(cwd, packageJson)
      }

      if (updates.length > 0) {
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
      }

      if (shouldSetupOxlint) {
        const spinner = prompter.spinner()

        if (shouldMigrateLegacyOxlint) {
          spinner.start("Migrating `.oxlintrc.json` to `oxlint.config.ts`...")
          yield* oxlint.update(cwd)
          spinner.stop("Oxlint config migrated successfully")
        } else if (oxlintState.format === null) {
          spinner.start("Creating `oxlint.config.ts`...")
          yield* oxlint.create(cwd)
          spinner.stop("Oxlint config created successfully")
        } else if (oxlintState.format === "ts") {
          spinner.start("Enabling type-checked linting in `oxlint.config.ts`...")
          yield* oxlint.ensureTypeCheck(cwd)
          spinner.stop("Type-checked linting enabled in `oxlint.config.ts`")
        }
      }

      if (shouldSetupTypescript) {
        const spinner = prompter.spinner()

        spinner.start("Ensuring TypeScript config is up to date...")

        if (typescriptExists) {
          yield* typescriptConfig.update(cwd)
          spinner.stop("`tsconfig.json` updated successfully")
        } else {
          yield* typescriptConfig.create(cwd)
          spinner.stop("`tsconfig.json` created successfully")
        }
      }

      if (shouldUpdateWorkflow) {
        const detectedPackageManager = yield* dependencyInstaller.detectPackageManager(cwd)

        if (detectedPackageManager) {
          const spinner = prompter.spinner()
          spinner.start("Updating GitHub Actions workflow...")
          yield* github.update(cwd, {
            packageManager: detectedPackageManager.name,
            scripts: managedScripts,
          })
          spinner.stop("GitHub Actions workflow updated successfully")
        } else {
          yield* prompter.log.warning(
            "Could not detect a package manager, so the GitHub Actions workflow was not updated."
          )
        }
      }

      if (updates.length === 0 && (shouldMigrateLegacyOxlint || migratedLegacyTypecheck)) {
        return "migrated" as const
      }

      return migratedLegacyTypecheck ? ("migrated" as const) : ("updated" as const)
    }).pipe(
      Effect.tap((value) =>
        Effect.gen(function* () {
          const prompter = yield* Prompter
          switch (value) {
            case "no-updates":
              yield* prompter.outro("✅ No updates needed")
              break
            case "cancelled":
              yield* prompter.outro("⚠️ Update cancelled")
              break
            case "updated":
              yield* prompter.outro("✅ Dependencies updated successfully!")
              break
            case "migrated":
              yield* prompter.outro("✅ Adamantite configuration migrated successfully!")
              break
            default:
              break
          }
        })
      ),
      Effect.catchTags({
        OperationCancelled: () =>
          Effect.gen(function* () {
            const prompter = yield* Prompter
            yield* prompter.cancel("You've cancelled the update process.")
          }),
      })
    )
  )
)
