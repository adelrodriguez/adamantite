import { join } from "node:path"
import process from "node:process"
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
} from "@clack/prompts"
import { exists, readPackageJson, writePackageJson } from "../utils"
import {
  biome,
  detectPackageManager,
  PACKAGE_MANAGERS,
  type PackageManager,
  tsconfig,
} from "./helpers"

const title = `
               █████                                                 █████     ███   █████            
              ░░███                                                 ░░███     ░░░   ░░███             
  ██████    ███████   ██████   █████████████    ██████   ████████   ███████   ████  ███████    ██████ 
 ░░░░░███  ███░░███  ░░░░░███ ░░███░░███░░███  ░░░░░███ ░░███░░███ ░░░███░   ░░███ ░░░███░    ███░░███
  ███████ ░███ ░███   ███████  ░███ ░███ ░███   ███████  ░███ ░███   ░███     ░███   ░███    ░███████ 
 ███░░███ ░███ ░███  ███░░███  ░███ ░███ ░███  ███░░███  ░███ ░███   ░███ ███ ░███   ░███ ███░███░░░  
░░████████░░████████░░████████ █████░███ █████░░████████ ████ █████  ░░█████  █████  ░░█████ ░░██████ 
 ░░░░░░░░  ░░░░░░░░  ░░░░░░░░ ░░░░░ ░░░ ░░░░░  ░░░░░░░░ ░░░░ ░░░░░    ░░░░░  ░░░░░    ░░░░░   ░░░░░░                   
`

async function selectPackageManager() {
  const selected = await select({
    message: "Select your package manager",
    options: PACKAGE_MANAGERS.map((pm) => ({
      label: pm,
      value: pm,
    })),
    initialValue: await detectPackageManager(),
  })

  if (isCancel(selected) || selected === null) {
    throw new Error("No package manager selected")
  }

  if (selected === undefined) {
    throw new Error("Invalid package manager selected")
  }

  return selected
}

async function checkIsMonorepo() {
  const cwd = process.cwd()

  // Check for pnpm-workspace.yaml (pnpm-specific)
  if (await exists(join(cwd, "pnpm-workspace.yaml"))) {
    return true
  }

  // Check for workspaces in package.json (npm, yarn, pnpm)
  try {
    const packageJson = await readPackageJson()
    return packageJson.workspaces !== undefined
  } catch {
    // If we can't read package.json, assume it's not a monorepo
    return false
  }
}

async function setupBiomeConfig() {
  const s = spinner()

  if (await biome.exists()) {
    s.start("Biome config found, updating...")

    await biome.update()

    s.stop("Biome config updated with Adamantite preset")
  } else {
    s.start("Biome config not found, creating...")

    await biome.create()

    s.stop("Biome config created with Adamantite preset")
  }
}

async function setupScripts({
  lint,
  format,
  //   monorepoLinting,
}: {
  lint: boolean
  format: boolean
  monorepoLinting: boolean
}) {
  const s = spinner()

  s.start("Adding scripts to your `package.json`...")

  try {
    const packageJson = await readPackageJson()

    // Initialize scripts object if it doesn't exist
    if (!packageJson.scripts) {
      packageJson.scripts = {}
    }

    if (lint) {
      // biome-ignore lint/complexity/useLiteralKeys: Lint script is not listed in the type
      packageJson.scripts["lint"] = "adamantite lint"
    }
    if (format) {
      // biome-ignore lint/complexity/useLiteralKeys: Format script is not listed in the type
      packageJson.scripts["format"] = "adamantite format"
    }

    // TODO: Add monorepo linting script
    //   if (monorepoLinting) {
    //     packageJson.scripts.lint = "adamantite lint --monorepo"
    //   }

    await writePackageJson(packageJson)

    s.stop("Scripts added to your `package.json`")
  } catch (error) {
    s.stop("Failed to add scripts")
    throw new Error(
      `Failed to modify package.json: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

async function setupTsConfig() {
  const s = spinner()

  if (await tsconfig.exists()) {
    s.start("`tsconfig.json` found, updating...")

    await tsconfig.update()

    s.stop("Updated `tsconfig.json` with preset")
  } else {
    s.start("`tsconfig.json` not found, creating...")

    await tsconfig.create()

    s.stop("Created `tsconfig.json` with preset")
  }
}

async function confirmAction(message: string): Promise<boolean> {
  const result = await confirm({ message })

  if (isCancel(result)) {
    throw new Error("Operation cancelled")
  }

  return result
}

async function installDependencies(packageManager: PackageManager) {
  const s = spinner()

  s.start("Installing dependencies...")

  try {
    const { runProcess, BIOME_VERSION } = await import("../utils")

    // Install both packages in a single command with exact versions
    switch (packageManager) {
      case "npm":
        runProcess("npm", [
          "install",
          "--save-dev",
          "--exact",
          "adamantite",
          `@biomejs/biome@${BIOME_VERSION}`,
        ])
        break
      case "yarn":
        runProcess("yarn", [
          "add",
          "--dev",
          "--exact",
          "adamantite",
          `@biomejs/biome@${BIOME_VERSION}`,
        ])
        break
      case "pnpm":
        runProcess("pnpm", [
          "add",
          "--save-dev",
          "--save-exact",
          "adamantite",
          `@biomejs/biome@${BIOME_VERSION}`,
        ])
        break
      case "bun":
        runProcess("bun", [
          "add",
          "--dev",
          "--exact",
          "adamantite",
          `@biomejs/biome@${BIOME_VERSION}`,
        ])
        break
      default:
        throw new Error(`Invalid package manager: ${packageManager}`)
    }

    s.stop("Dependencies installed successfully")
  } catch (error) {
    s.stop("Failed to install dependencies")

    // Provide more specific error messages
    if (error instanceof Error) {
      if (
        error.message.includes("EACCES") ||
        error.message.includes("permission")
      ) {
        throw new Error(
          "Failed to install dependencies: Permission denied. Try running with elevated permissions or check file permissions."
        )
      }
      if (
        error.message.includes("ENOTFOUND") ||
        error.message.includes("network")
      ) {
        throw new Error(
          "Failed to install dependencies: Network error. Check your internet connection and try again."
        )
      }
      if (error.message.includes("Invalid package manager")) {
        throw new Error(
          `Failed to install dependencies: Unsupported package manager: ${packageManager}. Please use npm, yarn, pnpm, or bun.`
        )
      }
    }

    throw new Error(
      `Failed to install dependencies: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

export default async function init() {
  intro(title)

  try {
    const packageManager = await selectPackageManager()

    const isMonorepo = await checkIsMonorepo()

    // TODO: Select whether to migrate the project to Adamantite (remove ESLint, Prettier, etc.)

    const installScripts = await confirmAction(
      "Do you want to add the `format` and `lint` scripts to your `package.json`?"
    )

    const installMonorepoScript = isMonorepo
      ? await confirmAction(
          "We've detected a monorepo setup in your project. Would you like to install monorepo linting scripts?"
        )
      : false

    const installTypeScript = await confirmAction(
      "Adamantite provides a TypeScript preset to enforce strict type-safety. Would you like to install it?"
    )

    // TODO: Select editor configuration
    // TODO: Select AI assistant rules

    await installDependencies(packageManager)

    await setupBiomeConfig()

    if (installScripts || installMonorepoScript) {
      await setupScripts({
        lint: installScripts,
        format: installScripts,
        monorepoLinting: installMonorepoScript,
      })
    }

    if (installTypeScript) {
      await setupTsConfig()
    }

    outro("💠 Adamantite initialized successfully!")
  } catch (error) {
    log.error(`${error instanceof Error ? error.message : "Unknown error"}`)

    cancel("Failed to initialize Adamantite")
  }
}
