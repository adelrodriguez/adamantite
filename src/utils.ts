import { access, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import process from "node:process"
import { detectPackageManager } from "nypm"
import type { PackageJson } from "type-fest"

export async function getPackageManagerName() {
  const result = await detectPackageManager(process.cwd())

  if (!result) {
    throw new Error("No package manager found")
  }

  const { warnings, ...packageManager } = result

  if (warnings && warnings.length > 0) {
    // biome-ignore lint/suspicious/noConsole: We want to log the warnings to the console
    console.warn(warnings.join("\n"))
  }

  return packageManager.name
}

export function handleCommandError(error: unknown) {
  const message =
    error instanceof Error ? error.message : "An unknown error occurred"

  // biome-ignore lint/suspicious/noConsole: We want to log the error to the console
  console.error("Failed to run Adamantite:", message)

  process.exit(1)
}

export async function exists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Reads and parses package.json with proper typing
 */
export async function readPackageJson(
  cwd = process.cwd()
): Promise<PackageJson> {
  const currentPath = join(cwd, "package.json")

  // Check if package.json exists
  if (!(await exists(currentPath))) {
    throw new Error("package.json not found in the current directory")
  }

  try {
    const content = await readFile(currentPath, "utf-8")
    const parsed = JSON.parse(content) as PackageJson

    return parsed
  } catch (error) {
    throw new Error(
      `Failed to parse package.json: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

/**
 * Writes package.json with proper formatting
 */
export async function writePackageJson(
  packageJson: PackageJson,
  cwd = process.cwd()
): Promise<void> {
  const currentPath = join(cwd, "package.json")

  try {
    await writeFile(currentPath, JSON.stringify(packageJson, null, 2))
  } catch (error) {
    throw new Error(
      `Failed to write package.json: ${error instanceof Error ? error.message : "Unknown error"}`
    )
  }
}

export function getTitle(): string {
  const terminalWidth = process.stdout.columns || 80

  if (terminalWidth >= 120) {
    return `
               █████                                                 █████     ███   █████            
              ░░███                                                 ░░███     ░░░   ░░███             
  ██████    ███████   ██████   █████████████    ██████   ████████   ███████   ████  ███████    ██████ 
 ░░░░░███  ███░░███  ░░░░░███ ░░███░░███░░███  ░░░░░███ ░░███░░███ ░░░███░   ░░███ ░░░███░    ███░░███
  ███████ ░███ ░███   ███████  ░███ ░███ ░███   ███████  ░███ ░███   ░███     ░███   ░███    ░███████ 
 ███░░███ ░███ ░███  ███░░███  ░███ ░███ ░███  ███░░███  ░███ ░███   ░███ ███ ░███   ░███ ███░███░░░  
░░████████░░████████░░████████ █████░███ █████░░████████ ████ █████  ░░█████  █████  ░░█████ ░░██████ 
 ░░░░░░░░  ░░░░░░░░  ░░░░░░░░ ░░░░░ ░░░ ░░░░░  ░░░░░░░░ ░░░░ ░░░░░    ░░░░░  ░░░░░    ░░░░░   ░░░░░░                   
`
  }

  return `
┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
┃                              ADAMANTITE                              ┃
┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
`
}
