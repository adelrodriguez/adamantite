import { cancel, confirm, intro, isCancel, log, outro, spinner } from "@clack/prompts"
import { Fault } from "faultier"
import { err, fromPromise, fromSafePromise, ok, safeTry } from "neverthrow"
import { addDevDependency } from "nypm"
import { biome } from "#helpers/packages/biome.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { defineCommand, getTitle, readPackageJson } from "#utils.ts"

export default defineCommand({
  command: "update",
  describe: "Update adamantite dependencies to latest compatible versions",
  builder: (yargs) => yargs,
  handler: async () => {
    intro(getTitle())

    const result = await safeTry(async function* () {
      // Read package.json using yield*
      const packageJson = yield* readPackageJson()

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
      ).andThen((r) => (isCancel(r) ? err(Fault.create("OPERATION_CANCELLED")) : ok(r)))

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
    })

    // Unified error handling at the end
    if (result.isOk()) {
      if (result.value === "no-updates") {
        outro("💠 No updates needed")
      } else if (result.value === "cancelled") {
        outro("💠 Update cancelled")
      } else if (result.value === "updated") {
        outro("💠 Dependencies updated successfully!")
      }

      return
    }

    if (result.error.tag === "OPERATION_CANCELLED") {
      cancel("You've cancelled the update process.")
      return
    }

    log.error(result.error.message)
    cancel("Failed to update dependencies")
  },
})
