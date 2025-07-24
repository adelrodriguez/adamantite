import { readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import defu from "defu"
import { parse } from "jsonc-parser"
import { exists } from "../utils"

interface InitializationHelper {
  config: Record<string, string | string[]>
  exists: () => Promise<boolean>
  create?: () => Promise<void>
  update?: (...args: unknown[]) => Promise<void>
  delete?: () => Promise<void>
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
} satisfies InitializationHelper
