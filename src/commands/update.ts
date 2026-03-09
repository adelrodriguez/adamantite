import * as Effect from "effect/Effect"
import * as Command from "effect/unstable/cli/Command"
import { knip } from "#helpers/packages/knip.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { DependencyInstaller } from "#services/dependency-installer.ts"
import { Prompter } from "#services/prompter.ts"
import { normalizeDependencyVersion, printTitle, readPackageJson } from "#utils.ts"

export default Command.make("update").pipe(
  Command.withDescription("Update adamantite dependencies to latest compatible versions"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const packageJson = yield* readPackageJson()
      const oxlintState = yield* oxlint.exists()
      const shouldMigrateLegacyOxlint = oxlintState.format === "json"

      yield* printTitle()

      yield* prompter.intro("💠 adamantite update")
      const dependencyInstaller = yield* DependencyInstaller

      // Detect updates needed
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

      if (oxlintState.hasBoth) {
        yield* prompter.log.warning(
          "Found both `oxlint.config.ts` and `.oxlintrc.json`. Adamantite will use `oxlint.config.ts`."
        )
      }

      // Early exit if no updates are needed and there is nothing to migrate
      if (updates.length === 0 && !shouldMigrateLegacyOxlint) {
        yield* prompter.log.success("All adamantite dependencies are already up to date!")
        return "no-updates" as const
      }

      // Confirm updates using confirm prompt
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

      if (updates.length > 0) {
        // Update dependencies with spinner
        const spinner = prompter.spinner()
        spinner.start("Updating dependencies...")

        yield* dependencyInstaller
          .addDevDependencies(
            updates.map((dep) => `${dep.name}@${dep.targetVersion}`),
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

      if (shouldMigrateLegacyOxlint) {
        const spinner = prompter.spinner()
        spinner.start("Migrating `.oxlintrc.json` to `oxlint.config.ts`...")

        yield* oxlint.update()

        spinner.stop("Oxlint config migrated successfully")
      }

      if (updates.length === 0 && shouldMigrateLegacyOxlint) {
        return "migrated" as const
      }

      return "updated" as const
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
              yield* prompter.outro("✅ Oxlint config migrated to `oxlint.config.ts`!")
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
