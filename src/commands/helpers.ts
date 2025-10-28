import { mkdir, readFile, writeFile } from "node:fs/promises"
import { join } from "node:path"
import defu from "defu"
import { parse } from "jsonc-parser"
import type { JsonValue } from "type-fest"
import { checkIfExists } from "../utils"

interface InitializationHelper {
  version?: string
  config: Record<string, JsonValue>
  exists: () => Promise<boolean>
  create?: () => Promise<void>
  update?: (...args: unknown[]) => Promise<void>
  delete?: () => Promise<void>
}

export const tsconfig = {
  config: { extends: "adamantite/tsconfig" },
  async exists() {
    return await checkIfExists(join(process.cwd(), "tsconfig.json"))
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

    const newConfig = defu(this.config, existingConfig)

    await writeFile(
      join(process.cwd(), "tsconfig.json"),
      JSON.stringify(newConfig, null, 2)
    )
  },
} satisfies InitializationHelper

export const biome = {
  version: "2.3.2",
  config: {
    // Ensures that the schema always matches the installed version of Biome
    $schema: "./node_modules/@biomejs/biome/configuration_schema.json",
  },
  async exists() {
    return await checkIfExists(join(process.cwd(), "biome.jsonc"))
  },
  async create() {
    await writeFile(
      join(process.cwd(), "biome.jsonc"),
      JSON.stringify({ ...this.config, extends: ["adamantite"] }, null, 2)
    )
  },
  async update() {
    const biomePath = (await checkIfExists(join(process.cwd(), "biome.jsonc")))
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

    // Merge other config properties (like $schema) - our config overrides existing
    const mergedConfig = defu(this.config, newConfig)

    await writeFile(
      join(process.cwd(), "biome.jsonc"),
      JSON.stringify(mergedConfig, null, 2)
    )
  },
} satisfies InitializationHelper

export const vscode = {
  config: {
    "typescript.tsdk": "node_modules/typescript/lib",
    "editor.formatOnSave": true,
    "editor.formatOnPaste": true,
    "editor.codeActionsOnSave": {
      "source.organizeImports.biome": "explicit",
      "source.fixAll.biome": "explicit",
    },
    "[javascript][typescript][javascriptreact][typescriptreact][json][jsonc][css][graphql]":
      {
        "editor.defaultFormatter": "biomejs.biome",
      },
  },
  async exists() {
    return await checkIfExists(join(process.cwd(), ".vscode", "settings.json"))
  },
  async create() {
    const vscodePath = join(process.cwd(), ".vscode")
    // Create .vscode directory if it doesn't exist
    await mkdir(vscodePath, { recursive: true })

    await writeFile(
      join(vscodePath, "settings.json"),
      JSON.stringify(this.config, null, 2)
    )
  },
  async update() {
    const vscodePath = join(process.cwd(), ".vscode", "settings.json")

    const vscodeFile = await readFile(vscodePath, "utf-8")

    const existingConfig = parse(vscodeFile)

    const newConfig = defu(this.config, existingConfig)

    await writeFile(
      join(process.cwd(), ".vscode", "settings.json"),
      JSON.stringify(newConfig, null, 2)
    )
  },
} satisfies InitializationHelper

export const sherif = {
  version: "1.7.0",
}
