import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import Bun from "bun"
import { parse } from "jsonc-parser"
import { vscode } from "#helpers/editors/vscode.ts"
import { knip } from "#helpers/packages/knip.ts"
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
        const oxlintConfigContent = await Bun.file("presets/lint/core.json").text()
        const cleanedContent = oxlintConfigContent
          .split("\n")
          .filter((line) => !line.trim().startsWith("//"))
          .join("\n")

        const oxlintConfig = parse(cleanedContent)
        const presetSchemaPath = oxlintConfig.$schema

        // Preset file is in presets/lint/, so it needs ../../ to reach node_modules
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

    describe("knip", () => {
      test("should define version as exact semver without range prefixes", () => {
        const version = knip.version

        expect(typeof version).toBe("string")
        expect(version).toMatch(SEMVER_REGEX)
        expect(version).not.toMatch(SEMVER_RANGE_REGEX)
      })

      test("should match the version specified in package.json devDependencies", async () => {
        const packageJsonResult = await readPackageJson(join(__dirname, ".."))
        const packageJson = packageJsonResult._unsafeUnwrap()
        const knipInPackage = packageJson.devDependencies?.knip

        expect(knipInPackage).toBe(knip.version)
      })

      test("should use schema URL from helper config", () => {
        expect(knip.config.$schema).toBeDefined()
        expect(knip.config.$schema).toContain("unpkg.com/knip")
        expect(knip.config.$schema).toContain("schema.json")
      })

      test("should set correct schema URL based on file extension in update()", async () => {
        const fs = await import("node:fs/promises")
        const os = await import("node:os")
        const path = await import("node:path")

        // Create a temporary directory for testing
        const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "knip-test-"))
        const originalCwd = process.cwd()

        try {
          // Change to temp directory
          process.chdir(tmpDir)

          // Test .json file
          const jsonPath = path.join(tmpDir, "knip.json")
          await fs.writeFile(jsonPath, JSON.stringify({ $schema: "old-schema" }, null, 2))

          const resultJson = await knip.update()
          expect(resultJson.isOk()).toBe(true)

          const jsonContent = JSON.parse(await fs.readFile(jsonPath, "utf8"))
          expect(jsonContent.$schema).toBe("https://unpkg.com/knip@5/schema.json")

          // Clean up and test .jsonc file
          await fs.unlink(jsonPath)

          const jsoncPath = path.join(tmpDir, "knip.jsonc")
          await fs.writeFile(jsoncPath, JSON.stringify({ $schema: "old-schema" }, null, 2))

          const resultJsonc = await knip.update()
          expect(resultJsonc.isOk()).toBe(true)

          const jsoncContent = JSON.parse(await fs.readFile(jsoncPath, "utf8"))
          expect(jsoncContent.$schema).toBe("https://unpkg.com/knip@5/schema-jsonc.json")
        } finally {
          // Restore original directory and clean up
          process.chdir(originalCwd)
          await fs.rm(tmpDir, { force: true, recursive: true })
        }
      })
    })

    describe("typescript", () => {
      test("should define version as exact semver without range prefixes", () => {
        const version = typescript.version

        expect(typeof version).toBe("string")
        // TypeScript uses dev versions (e.g., 7.0.0-dev.20260103.1)
        // Check that it starts with semver format and doesn't have range prefixes
        expect(version).toMatch(/^\d+\.\d+\.\d+/)
        expect(version).not.toMatch(SEMVER_RANGE_REGEX)
      })

      test("should match the version specified in package.json devDependencies", async () => {
        const packageJsonResult = await readPackageJson(join(__dirname, ".."))
        const packageJson = packageJsonResult._unsafeUnwrap()
        const typescriptInPackage = packageJson.devDependencies?.["@typescript/native-preview"]

        expect(typescriptInPackage).toBe(typescript.version)
      })

      test("should provide a config that extends adamantite tsconfig preset", () => {
        expect(typescript.config).toHaveProperty("extends")
        expect(typescript.config.extends).toBe("adamantite/typescript")
      })

      test("should have name, version, and command properties", () => {
        expect(typescript.name).toBe("@typescript/native-preview")
        expect(typescript.version).toBeDefined()
        expect(typescript.command).toBe("tsgo")
      })
    })
  })

  describe("editors", () => {
    describe("vscode", () => {
      test("should configure oxc as default formatter for supported file types", () => {
        const supportedFileTypes = [
          "[javascript]",
          "[typescript]",
          "[javascriptreact]",
          "[typescriptreact]",
          "[json]",
          "[jsonc]",
          "[css]",
          "[graphql]",
        ]

        for (const fileType of supportedFileTypes) {
          // @ts-expect-error - fileType is a valid key of vscode.config
          const fileTypeConfig = vscode.config[fileType]
          expect(fileTypeConfig).toBeDefined()
          expect(fileTypeConfig["editor.defaultFormatter"]).toBe("oxc.oxc-vscode")
        }
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
