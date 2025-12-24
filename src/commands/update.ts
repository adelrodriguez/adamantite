import process from "node:process"
import { cancel, confirm, intro, isCancel, log, outro, spinner } from "@clack/prompts"
import { Fault } from "faultier"
import { err, fromPromise, fromSafePromise, ok, safeTry } from "neverthrow"
import { addDevDependency } from "nypm"
import { biome } from "#helpers/packages/biome.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { defineCommand, printTitle, readPackageJson } from "#utils.ts"

export default defineCommand({
  command: "update",
  describe: "Update adamantite dependencies to latest compatible versions",
  builder: (yargs) => yargs,
  handler: async () =>
    safeTry(async function* () {
      const packageJson = yield* readPackageJson()

      printTitle()

      intro("💠 adamantite update")

      // Detect updates needed
      const updates: {
        name: string
        currentVersion: string
        targetVersion: string
        isDevDependency: boolean
      }[] = []

      for (const pkg of [biome, sherif]) {
        const dependency = packageJson.devDependencies?.[pkg.name]
        if (dependency && dependency !== pkg.version) {
          updates.push({
            name: pkg.name,
            currentVersion: dependency,
            targetVersion: pkg.version,
            isDevDependency: true,
          })
        }
      }

      // Early exit if no updates
      if (updates.length === 0) {
        log.success("All adamantite dependencies are already up to date!")
        return ok("no-updates" as const)
      }

      // Confirm updates using fromSafePromise + isCancel check
      log.message("The following dependencies will be updated:")
      log.message("")

      for (const dep of updates) {
        log.message(`  ${dep.name}: ${dep.currentVersion} → ${dep.targetVersion}`)
      }

      log.message("")

      const shouldUpdate = yield* fromSafePromise(
        confirm({
          message: "Do you want to proceed with these updates?",
        })
      )

      if (isCancel(shouldUpdate)) {
        return err(Fault.create("OPERATION_CANCELLED"))
      }

      if (!shouldUpdate) {
        return ok("cancelled" as const)
      }

      // Update dependencies with spinner and fromPromise
      const s = spinner()
      s.start("Updating dependencies...")

      for (const dep of updates) {
        yield* fromPromise(addDevDependency(`${dep.name}@${dep.targetVersion}`), (error) =>
          Fault.wrap(error)
            .withTag("FAILED_TO_INSTALL_DEPENDENCY")
            .withMessage(`Failed to update ${dep.name}`)
        )
      }

      s.stop("Dependencies updated successfully")
      return ok("updated" as const)
    }).match(
      (value) => {
        if (value === "no-updates") {
          outro("✅ No updates needed")
        } else if (value === "cancelled") {
          outro("⚠️ Update cancelled")
        } else if (value === "updated") {
          outro("✅ Dependencies updated successfully!")
        }

        process.exit(0)
      },
      (error) => {
        if (Fault.isFault(error) && error.tag === "OPERATION_CANCELLED") {
          cancel("You've cancelled the update process.")
          process.exit(0)
        }

        if (Fault.isFault(error)) {
          log.error(error.flatten())
        } else {
          log.error(String(error))
        }

        cancel("Failed to update dependencies")
        process.exit(1)
      }
    ),
})
