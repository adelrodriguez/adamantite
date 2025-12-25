import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import Bun from "bun"
import { parse } from "jsonc-parser"
import { vscode } from "#helpers/editors/vscode.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint, tsgolint } from "#helpers/packages/oxlint.ts"
import { sherif } from "#helpers/packages/sherif.ts"
import { typescript } from "#helpers/packages/typescript.ts"
import { readPackageJson } from "#utils.ts"

const SEMVER_REGEX = /^\d+\.\d+\.\d+$/
const SEMVER_RANGE_REGEX = /[\^~><=]/

describe("helpers", () => {
  describe("packages", () => {
    describe("oxlint", () => {
      test("should define version as exact semver without range prefixes", () => {
        const version = oxlint.version

        expect(typeof version).toBe("string")
        expect(version).toMatch(SEMVER_REGEX)
        expect(version).not.toMatch(SEMVER_RANGE_REGEX)
      })

      test("should match the version specified in package.json devDependencies", async () => {
        const packageJsonResult = await readPackageJson(join(__dirname, ".."))
        const packageJson = packageJsonResult._unsafeUnwrap()
        const oxlintInPackage = packageJson.devDependencies?.oxlint

        expect(oxlintInPackage).toBe(oxlint.version)
      })

      test("should use local schema path from helper config", async () => {
        const oxlintConfigContent = await Bun.file("presets/oxlint/core.json").text()
        const cleanedContent = oxlintConfigContent
          .split("\n")
          .filter((line) => !line.trim().startsWith("//"))
          .join("\n")

        const oxlintConfig = parse(cleanedContent)
        const presetSchemaPath = oxlintConfig.$schema

        // Preset file is in presets/oxlint/, so it needs ../../ to reach node_modules
        expect(presetSchemaPath).toContain("node_modules/oxlint")
        expect(presetSchemaPath).toContain("configuration_schema.json")

        // Helper config schema path is for root-level .oxlintrc.json files
        expect(oxlint.config.$schema).toContain("node_modules/oxlint")
        expect(oxlint.config.$schema).toContain("configuration_schema.json")
      })
    })

    describe("tsgolint", () => {
      test("should define version as exact semver without range prefixes", () => {
        const version = tsgolint.version

        expect(typeof version).toBe("string")
        expect(version).toMatch(SEMVER_REGEX)
        expect(version).not.toMatch(SEMVER_RANGE_REGEX)
      })

      test("should match the version specified in package.json devDependencies", async () => {
        const packageJsonResult = await readPackageJson(join(__dirname, ".."))
        const packageJson = packageJsonResult._unsafeUnwrap()
        const tsgolintInPackage = packageJson.devDependencies?.["oxlint-tsgolint"]

        expect(tsgolintInPackage).toBe(tsgolint.version)
      })
    })

    describe("oxfmt", () => {
      test("should define version as exact semver without range prefixes", () => {
        const version = oxfmt.version

        expect(typeof version).toBe("string")
        expect(version).toMatch(SEMVER_REGEX)
        expect(version).not.toMatch(SEMVER_RANGE_REGEX)
      })

      test("should match the version specified in package.json devDependencies", async () => {
        const packageJsonResult = await readPackageJson(join(__dirname, ".."))
        const packageJson = packageJsonResult._unsafeUnwrap()
        const oxfmtInPackage = packageJson.devDependencies?.oxfmt

        expect(oxfmtInPackage).toBe(oxfmt.version)
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
        const packageJsonResult = await readPackageJson(join(__dirname, ".."))
        const packageJson = packageJsonResult._unsafeUnwrap()
        const sherifInPackage = packageJson.devDependencies?.sherif

        expect(sherifInPackage).toBe(sherif.version)
      })
    })

    describe("typescript", () => {
      test("should provide a config that extends adamantite tsconfig preset", () => {
        expect(typescript.config).toHaveProperty("extends")
        expect(typescript.config.extends).toBe("adamantite/typescript")
      })
    })
  })

  describe("editors", () => {
    describe("vscode", () => {
      test("should configure oxc as default formatter for supported file types", () => {
        const fileTypeConfig =
          vscode.config[
            "[javascript][typescript][javascriptreact][typescriptreact][json][jsonc][css][graphql]"
          ]

        expect(fileTypeConfig).toBeDefined()
        expect(fileTypeConfig["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")
      })

      test("should enable format on save and paste", () => {
        expect(vscode.config["editor.formatOnSave"]).toBe(true)
        expect(vscode.config["editor.formatOnPaste"]).toBe(true)
      })

      test("should configure oxc code actions on save", () => {
        const codeActions = vscode.config["editor.codeActionsOnSave"]

        expect(codeActions).toBeDefined()
        expect(codeActions["source.fixAll.oxc"]).toBe("explicit")
      })
    })
  })
})
