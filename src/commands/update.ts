import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  outro,
  spinner,
} from "@clack/prompts"
import {
  detectPackageManager,
  getTitle,
  type PackageManager,
  readPackageJson,
  runProcess,
} from "../utils"
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

function updateDependencies(
  packageManager: PackageManager,
  updates: DependencyUpdate[]
) {
  const s = spinner()

  s.start("Updating dependencies...")

  try {
    // Build the list of packages to install with exact versions
    const packages = updates.map((dep) => `${dep.name}@${dep.targetVersion}`)

    // Update packages in a single command with exact versions
    switch (packageManager) {
      case "npm":
        runProcess("npm", [
          "install",
          "--save-dev",
          "--save-exact",
          ...packages,
        ])
        break
      case "yarn":
        runProcess("yarn", ["add", "--dev", "--exact", ...packages])
        break
      case "pnpm":
        runProcess("pnpm", ["add", "--save-dev", "--save-exact", ...packages])
        break
      case "bun":
        runProcess("bun", ["add", "--dev", "--exact", ...packages])
        break
      default:
        throw new Error(`Invalid package manager: ${packageManager}`)
    }

    s.stop("Dependencies updated successfully")
  } catch (error) {
    s.stop("Failed to update dependencies")

    throw new Error(
      `Failed to update dependencies: ${error instanceof Error ? error.message : "Unknown error"}`
    )
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

export default async function update() {
  intro(getTitle())

  try {
    const packageManager = await detectPackageManager()

    if (!packageManager) {
      throw new Error(
        "Unable to detect package manager. Please ensure you have a lock file (package-lock.json, yarn.lock, pnpm-lock.yaml, or bun.lock/bun.lockb) in your project."
      )
    }

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

    updateDependencies(packageManager, updates)

    outro("💠 Dependencies updated successfully!")
  } catch (error) {
    log.error(`${error instanceof Error ? error.message : "Unknown error"}`)
    cancel("Failed to update dependencies")
  }
}
