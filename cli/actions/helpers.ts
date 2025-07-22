import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import defu from "defu"
import { parse } from "jsonc-parser"
import {
  BIOME_VERSION,
  exists,
  getInstalledPackageVersion,
  installDevDependency,
  isPackageVersionCorrect,
} from "../utils"

interface InitializationHelper {
  config: Record<string, string | string[]>
  exists: () => Promise<boolean>
  create?: () => Promise<void>
  update?: (...args: unknown[]) => Promise<void>
  delete?: () => Promise<void>
  install?: (packageManager: PackageManager) => Promise<string>
}

export const PACKAGE_MANAGERS = ["npm", "yarn", "pnpm", "bun"] as const
export type PackageManager = (typeof PACKAGE_MANAGERS)[number]

export async function detectPackageManager(): Promise<PackageManager | null> {
  const cwd = process.cwd()

  const isNpm = await exists(join(cwd, "package-lock.json"))

  if (isNpm) {
    return "npm"
  }

  const isYarn = await exists(join(cwd, "yarn.lock"))

  if (isYarn) {
    return "yarn"
  }

  const isPnpm = await exists(join(cwd, "pnpm-lock.yaml"))

  if (isPnpm) {
    return "pnpm"
  }

  const isBun =
    (await exists(join(cwd, "bun.lockb"))) ||
    (await exists(join(cwd, "bun.lock")))

  if (isBun) {
    return "bun"
  }

  return null
}

export const tsconfig = {
  config: { extends: "adamantite/presets/tsconfig.json" },
  async exists() {
    return await exists(join(process.cwd(), "tsconfig.json"))
  },
  async create() {
    await writeFile(
      join(process.cwd(), "tsconfig.json"),
      JSON.stringify(this.config, null, 2)
    )
  },
  async update() {
    const tsconfigFile = await readFile(
      join(process.cwd(), "tsconfig.json"),
      "utf-8"
    )
    const existingConfig = parse(tsconfigFile)

    const newConfig = defu(existingConfig, this.config)

    await writeFile(
      join(process.cwd(), "tsconfig.json"),
      JSON.stringify(newConfig, null, 2)
    )
  },
} satisfies InitializationHelper

export const biome = {
  config: {
    // Ensures that the schema always matches the installed version of Biome
    $schema: "./node_modules/@biomejs/biome/configuration_schema.json",
  },
  async exists() {
    return await exists(join(process.cwd(), "biome.jsonc"))
  },
  async create() {
    await writeFile(
      join(process.cwd(), "biome.jsonc"),
      JSON.stringify({ ...this.config, extends: ["adamantite"] }, null, 2)
    )
  },
  async update() {
    const biomePath = (await exists(join(process.cwd(), "biome.jsonc")))
      ? join(process.cwd(), "biome.jsonc")
      : join(process.cwd(), "biome.json")

    const biomeFile = await readFile(biomePath, "utf-8")

    const existingConfig = parse(biomeFile)

    // Start with existing config
    const newConfig = { ...existingConfig }

    // Ensure extends is an array
    if (!Array.isArray(newConfig.extends)) {
      newConfig.extends = newConfig.extends ? [newConfig.extends] : []
    }

    // Only add "adamantite" if it's not already present
    if (!newConfig.extends.includes("adamantite")) {
      newConfig.extends.push("adamantite")
    }

    // Merge other config properties (like $schema)
    const mergedConfig = defu(newConfig, this.config)

    await writeFile(
      join(process.cwd(), "biome.jsonc"),
      JSON.stringify(mergedConfig, null, 2)
    )
  },
  async install(packageManager: PackageManager): Promise<string> {
    // Check if @biomejs/biome is already installed with correct version
    const isVersionCorrect = await isPackageVersionCorrect(
      "@biomejs/biome",
      BIOME_VERSION
    )

    if (isVersionCorrect) {
      return `@biomejs/biome@${BIOME_VERSION} is already installed`
    }

    // Check if a different version is installed
    const installedVersion = await getInstalledPackageVersion("@biomejs/biome")
    const action = installedVersion ? "updated" : "installed"

    installDevDependency(packageManager, `@biomejs/biome@${BIOME_VERSION}`)

    return `@biomejs/biome@${BIOME_VERSION} ${action} successfully`
  },
} satisfies InitializationHelper
