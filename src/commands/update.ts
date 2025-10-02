import { confirm, intro, isCancel, log, outro, spinner } from "@clack/prompts"
import { defineCommand } from "citty"
import { addDevDependency } from "nypm"
import { getTitle, handleCommandError, readPackageJson } from "../utils"
import { biome, sherif } from "./helpers"

interface DependencyUpdate {
  name: string
  currentVersion: string
  targetVersion: string
  isDevDependency: boolean
}

async function detectUpdatesNeeded(): Promise<DependencyUpdate[]> {
  const updates: DependencyUpdate[] = []

  try {
    const packageJson = await readPackageJson()

    // Check @biomejs/biome
    const biomeDep = packageJson.devDependencies?.["@biomejs/biome"]
    if (biomeDep && biomeDep !== biome.version) {
      updates.push({
        name: "@biomejs/biome",
        currentVersion: biomeDep,
        targetVersion: biome.version,
        isDevDependency: true,
      })
    }

    // Check sherif
    const sherifDep = packageJson.devDependencies?.sherif
    if (sherifDep && sherifDep !== sherif.version) {
      updates.push({
        name: "sherif",
        currentVersion: sherifDep,
        targetVersion: sherif.version,
        isDevDependency: true,
      })
    }

    return updates
  } catch (error) {
    throw new Error(
      `Failed to read package.json: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

async function updateDependencies(updates: DependencyUpdate[]) {
  const s = spinner()

  s.start("Updating dependencies...")

  try {
    // Update each dependency with its exact version
    const tasks = updates.map((dep) =>
      addDevDependency(`${dep.name}@${dep.targetVersion}`)
    )

    const results = await Promise.allSettled(tasks)

    // Check for failures and successes
    const failures: string[] = []
    const successes: string[] = []

    for (const [index, result] of results.entries()) {
      const dep = updates[index]

      if (!dep) {
        continue
      }

      const depName = dep.name
      if (result.status === "fulfilled") {
        successes.push(depName)
      } else {
        failures.push(
          `${depName}: ${result.reason?.message || "Unknown error"}`
        )
      }
    }

    if (failures.length === 0) {
      s.stop("Dependencies updated successfully")
    } else if (successes.length === 0) {
      s.stop("Failed to update dependencies")
      throw new Error(`All dependency updates failed:\n${failures.join("\n")}`)
    } else {
      s.stop("Partial update completed")
      log.warn("Some dependencies failed to update:")
      for (const failure of failures) {
        log.warn(`  ${failure}`)
      }
      log.success(`Successfully updated: ${successes.join(", ")}`)
    }
  } catch (error) {
    s.stop("Failed to update dependencies")
    throw error
  }
}

async function confirmUpdate(updates: DependencyUpdate[]): Promise<boolean> {
  log.message("The following dependencies will be updated:")
  log.message("")

  for (const dep of updates) {
    log.message(`  ${dep.name}: ${dep.currentVersion} → ${dep.targetVersion}`)
  }

  log.message("")

  const result = await confirm({
    message: "Do you want to proceed with these updates?",
  })

  if (isCancel(result)) {
    throw new Error("Operation cancelled")
  }

  return result
}

export default defineCommand({
  meta: {
    name: "update",
    description: "Update adamantite dependencies to latest compatible versions",
  },
  run: async () => {
    intro(getTitle())

    try {
      const updates = await detectUpdatesNeeded()

      if (updates.length === 0) {
        log.success("All adamantite dependencies are already up to date!")
        outro("💠 No updates needed")
        return
      }

      const shouldUpdate = await confirmUpdate(updates)

      if (!shouldUpdate) {
        outro("💠 Update cancelled")
        return
      }

      await updateDependencies(updates)

      outro("💠 Dependencies updated successfully!")
    } catch (error) {
      handleCommandError(error)
    }
  },
})
