import { join } from "node:path"
import process from "node:process"
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiselect,
  outro,
  select,
  spinner,
} from "@clack/prompts"
import {
  BIOME_VERSION,
  detectPackageManager,
  exists,
  PACKAGE_MANAGERS,
  type PackageManager,
  readPackageJson,
  runProcess,
  SHERIF_VERSION,
  writePackageJson,
} from "../utils"
import { biome, tsconfig, vscode } from "./helpers"

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
  monorepo,
}: {
  lint: boolean
  format: boolean
  monorepo: boolean
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

    if (monorepo) {
      packageJson.scripts["lint:monorepo"] = "adamantite monorepo"
    }

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

async function selectEditorConfig() {
  const selected = await multiselect({
    message: "Which editors do you want to configure (recommended)?",
    options: [
      { label: "VSCode / Cursor / Windsurf", value: "vscode" },
      { label: "Zed (coming soon)", value: "zed" },
    ],
    required: false,
  })

  if (isCancel(selected)) {
    throw new Error("Operation cancelled")
  }

  return selected
}

async function setupEditorConfig(selectedEditors: ("vscode" | "zed")[]) {
  if (!selectedEditors || selectedEditors.length === 0) {
    return
  }

  const s = spinner()

  if (selectedEditors.includes("vscode")) {
    if (await vscode.exists()) {
      s.start("VSCode settings found, updating...")
      await vscode.update()
      s.stop("VSCode settings updated with Adamantite preset")
    } else {
      s.start("VSCode settings not found, creating...")
      await vscode.create()
      s.stop("VSCode settings created with Adamantite preset")
    }
  }

  if (selectedEditors.includes("zed")) {
    s.start("Zed configuration coming soon...")
    s.stop("Zed configuration coming soon...")
  }
}

async function confirmAction(message: string): Promise<boolean> {
  const result = await confirm({ message })

  if (isCancel(result)) {
    throw new Error("Operation cancelled")
  }

  return result
}

function installDependencies(
  packageManager: PackageManager,
  options?: { monorepo?: boolean }
) {
  const s = spinner()

  s.start("Installing dependencies...")

  try {
    // Build the list of packages to install
    const packages = ["adamantite", `@biomejs/biome@${BIOME_VERSION}`]

    if (options?.monorepo) {
      packages.push(`sherif@${SHERIF_VERSION}`)
    }

    // Install packages in a single command with exact versions
    switch (packageManager) {
      case "npm":
        runProcess("npm", ["install", "--save-dev", "--exact", ...packages])
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

    s.stop("Dependencies installed successfully")
  } catch (error) {
    s.stop("Failed to install dependencies")

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

    const selectedEditors = await selectEditorConfig()

    // TODO: Select AI assistant rules

    installDependencies(packageManager, {
      monorepo: installMonorepoScript,
    })

    await setupBiomeConfig()

    if (installScripts || installMonorepoScript) {
      await setupScripts({
        lint: installScripts,
        format: installScripts,
        monorepo: installMonorepoScript,
      })
    }

    if (installTypeScript) {
      await setupTsConfig()
    }

    await setupEditorConfig(selectedEditors)

    outro("💠 Adamantite initialized successfully!")
  } catch (error) {
    log.error(`${error instanceof Error ? error.message : "Unknown error"}`)

    cancel("Failed to initialize Adamantite")
  }
}
