import { isCancel } from "@clack/prompts"
import { Command } from "@effect/cli"
import { Effect } from "effect"
import { addDevDependency } from "nypm"
import { FailedToInstallDependency, OperationCancelled } from "#errors.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { Prompter } from "#services/prompter.ts"
import { normalizeDependencyVersion, printTitle, readPackageJson } from "#utils.ts"

export default Command.make("update").pipe(
  Command.withDescription("Update adamantite dependencies to latest compatible versions"),
  Command.withHandler(() =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const packageJson = yield* readPackageJson()

      yield* printTitle()

      yield* prompter.intro("💠 adamantite update")

      // Detect updates needed
      const updates: Array<{
        name: string
        currentVersion: string
        targetVersion: string
        isDevDependency: boolean
      }> = []

      for (const pkg of [oxlint, oxfmt, sherif]) {
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

      // Early exit if no updates
      if (updates.length === 0) {
        yield* prompter.log.success("All adamantite dependencies are already up to date!")
        return "no-updates" as const
      }

      // Confirm updates using confirm prompt
      yield* prompter.log.info("The following dependencies will be updated:")

      for (const dep of updates) {
        yield* prompter.log.info(`  ${dep.name}: ${dep.currentVersion} → ${dep.targetVersion}`)
      }

      const shouldUpdate = yield* prompter.confirm({
        message: "Do you want to proceed with these updates?",
      })

      if (isCancel(shouldUpdate)) {
        return yield* Effect.fail(new OperationCancelled({ reason: "update-cancelled" }))
      }

      if (!shouldUpdate) {
        return "cancelled" as const
      }

      // Update dependencies with spinner
      const spinner = prompter.spinner()
      spinner.start("Updating dependencies...")

      yield* Effect.tryPromise({
        catch: (cause) =>
          new FailedToInstallDependency({
            cause,
            packages: updates.map((dep) => dep.name),
          }),
        try: () =>
          addDevDependency(
            updates.map((dep) => `${dep.name}@${dep.targetVersion}`),
            { silent: true }
          ),
      }).pipe(
        Effect.tapError(() =>
          Effect.sync(() => {
            spinner.stop("Failed to update dependencies")
          })
        )
      )

      spinner.stop("Dependencies updated successfully")
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
