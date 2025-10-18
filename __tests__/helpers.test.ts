import { describe, expect, test } from "bun:test"
import Bun from "bun"
import { join } from "node:path"
import { biome, sherif, tsconfig, vscode } from "../src/commands/helpers"
import { readPackageJson } from "../src/utils"

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/
const SEMVER_RANGE_REGEX = /[\^~><=]/

describe("helpers", () => {
  describe("biome", () => {
    test("should define version as exact semver without range prefixes", () => {
      const version = biome.version

      expect(typeof version).toBe("string")
      expect(version).toMatch(SEMVER_REGEX)
      expect(version).not.toMatch(SEMVER_RANGE_REGEX)
    })

    test("should match the version specified in package.json devDependencies", async () => {
      const packageJson = await readPackageJson(join(__dirname, ".."))
      const biomeInPackage = packageJson.devDependencies?.["@biomejs/biome"]

      expect(biomeInPackage).toBe(biome.version)
    })

    test("should use local schema path from helper config", async () => {
      const biomeConfigContent = await Bun.file("biome.jsonc").text()
      const cleanedContent = biomeConfigContent
        .split("\n")
        .filter((line) => !line.trim().startsWith("//"))
        .join("\n")

      const biomeConfig = JSON.parse(cleanedContent)
      const schemaPath = biomeConfig.$schema

      expect(schemaPath).toBe(biome.config.$schema)

      expect(schemaPath).toContain("node_modules/@biomejs/biome")
    })
  })

  describe("sherif", () => {
    test("should define version as exact semver without range prefixes", () => {
      const version = sherif.version

      expect(typeof version).toBe("string")
      expect(version).toMatch(SEMVER_REGEX)
      expect(version).not.toMatch(SEMVER_RANGE_REGEX)
    })

    test("should match the version specified in package.json devDependencies", async () => {
      const packageJson = await readPackageJson(join(__dirname, ".."))
      const sherifInPackage = packageJson.devDependencies?.sherif

      expect(sherifInPackage).toBe(sherif.version)
    })
  })

  describe("tsconfig", () => {
    test("should provide a config that extends adamantite tsconfig preset", () => {
      expect(tsconfig.config).toHaveProperty("extends")
      expect(tsconfig.config.extends).toBe("adamantite/tsconfig")
    })
  })

  describe("vscode", () => {
    test("should configure Biome as default formatter for supported file types", () => {
      const fileTypeConfig =
        vscode.config[
          "[javascript][typescript][javascriptreact][typescriptreact][json][jsonc][css][graphql]"
        ]

      expect(fileTypeConfig).toBeDefined()
      expect(fileTypeConfig["editor.defaultFormatter"]).toBe("biomejs.biome")
    })

    test("should enable format on save and paste", () => {
      expect(vscode.config["editor.formatOnSave"]).toBe(true)
      expect(vscode.config["editor.formatOnPaste"]).toBe(true)
    })

    test("should configure Biome code actions on save", () => {
      const codeActions = vscode.config["editor.codeActionsOnSave"]

      expect(codeActions).toBeDefined()
      expect(codeActions["source.organizeImports.biome"]).toBe("explicit")
      expect(codeActions["source.fixAll.biome"]).toBe("explicit")
    })
  })
})
