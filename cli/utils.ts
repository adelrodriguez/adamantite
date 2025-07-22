import { type ExecSyncOptions, execSync } from "node:child_process"
import { access, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { PackageJson } from "type-fest"

// The current version of Biome that this project supports
export const BIOME_VERSION = "2.1.2"

// Cache for package.json to avoid multiple reads
let packageJsonCache: PackageJson | null = null
let packageJsonPath: string | null = null

export function runProcess(
  command: string,
  args: string[] = [],
  options: Omit<ExecSyncOptions, "stdio"> = {}
) {
  const commandWithArgs = `${command} ${args.join(" ")}`

  execSync(commandWithArgs, { ...options, stdio: "inherit" })
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
 * Reads and parses package.json with caching and proper typing
 */
export async function readPackageJson(cwd = process.cwd()): Promise<PackageJson> {
  const currentPath = join(cwd, "package.json")
  
  // Return cached version if we've already read the same file
  if (packageJsonCache && packageJsonPath === currentPath) {
    return packageJsonCache
  }

  // Check if package.json exists
  if (!(await exists(currentPath))) {
    throw new Error("package.json not found in the current directory")
  }

  try {
    const content = await readFile(currentPath, "utf-8")
    const parsed = JSON.parse(content) as PackageJson
    
    // Cache the result
    packageJsonCache = parsed
    packageJsonPath = currentPath
    
    return parsed
  } catch (error) {
    throw new Error(`Failed to parse package.json: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Writes package.json with proper formatting and cache invalidation
 */
export async function writePackageJson(packageJson: PackageJson, cwd = process.cwd()): Promise<void> {
  const currentPath = join(cwd, "package.json")
  
  try {
    await writeFile(currentPath, JSON.stringify(packageJson, null, 2))
    
    // Invalidate cache since we've modified the file
    if (packageJsonPath === currentPath) {
      packageJsonCache = packageJson
    }
  } catch (error) {
    throw new Error(`Failed to write package.json: ${error instanceof Error ? error.message : "Unknown error"}`)
  }
}

/**
 * Checks if a package is installed as a dependency or devDependency
 */
export async function isPackageInstalled(packageName: string, cwd = process.cwd()): Promise<boolean> {
  try {
    const packageJson = await readPackageJson(cwd)
    return !!(
      packageJson.dependencies?.[packageName] || 
      packageJson.devDependencies?.[packageName]
    )
  } catch {
    return false
  }
}

/**
 * Gets the installed version of a package, or null if not installed
 */
export async function getInstalledPackageVersion(packageName: string, cwd = process.cwd()): Promise<string | null> {
  try {
    const packageJson = await readPackageJson(cwd)
    return packageJson.dependencies?.[packageName] || 
           packageJson.devDependencies?.[packageName] || 
           null
  } catch {
    return null
  }
}

/**
 * Checks if the installed package version matches the expected version
 */
export async function isPackageVersionCorrect(
  packageName: string, 
  expectedVersion: string, 
  cwd = process.cwd()
): Promise<boolean> {
  const installedVersion = await getInstalledPackageVersion(packageName, cwd)
  return installedVersion === expectedVersion
}

