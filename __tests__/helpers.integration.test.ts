import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import Bun from "bun"
import { mkdirSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { biome, tsconfig, vscode } from "../src/commands/helpers"

describe("helpers integration", () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(async () => {
    // Save original directory
    originalCwd = process.cwd()

    // Create temp directory
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-test-"))

    // Change to temp directory
    process.chdir(tempDir)

    // Set up initial package.json
    await Bun.write(
      "package.json",
      JSON.stringify(
        {
          name: "test-project",
          version: "1.0.0",
          devDependencies: {},
        },
        null,
        2
      )
    )
  })

  afterEach(() => {
    // Restore original directory
    process.chdir(originalCwd)

    // Clean up temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors in tests
    }
  })

  describe("biome helper", () => {
    test("should detect when biome.jsonc does not exist", async () => {
      const exists = await biome.exists()
      expect(exists).toBe(false)
    })

    test("should create biome.jsonc with correct config", async () => {
      await biome.create()

      const exists = await biome.exists()
      expect(exists).toBe(true)

      const content = await Bun.file("biome.jsonc").text()
      const config = JSON.parse(content)

      expect(config).toHaveProperty("$schema")
      expect(config.$schema).toBe(
        "./node_modules/@biomejs/biome/configuration_schema.json"
      )
      expect(config).toHaveProperty("extends")
      expect(config.extends).toEqual(["adamantite"])
    })

    test("should update existing biome.jsonc config", async () => {
      // Create initial config
      await Bun.write(
        "biome.jsonc",
        JSON.stringify(
          {
            $schema: "https://biomejs.dev/schemas/1.0.0/schema.json",
            rules: {
              recommended: true,
            },
          },
          null,
          2
        )
      )

      const existsBefore = await biome.exists()
      expect(existsBefore).toBe(true)

      await biome.update()

      const content = await Bun.file("biome.jsonc").text()
      const config = JSON.parse(content)

      // Should preserve existing rules but add adamantite to extends and override schema
      expect(config.rules).toEqual({ recommended: true })
      expect(config.extends).toEqual(["adamantite"])
      // Our config should override existing schema
      expect(config.$schema).toBe(
        "./node_modules/@biomejs/biome/configuration_schema.json"
      )
    })

    test("should handle updating config with existing extends array", async () => {
      // Create config with existing extends
      await Bun.write(
        "biome.jsonc",
        JSON.stringify(
          {
            extends: ["@company/config"],
            rules: {
              recommended: true,
            },
          },
          null,
          2
        )
      )

      await biome.update()

      const content = await Bun.file("biome.jsonc").text()
      const config = JSON.parse(content)

      // Should preserve existing extends and add adamantite
      expect(config.extends).toEqual(["@company/config", "adamantite"])
      expect(config.rules).toEqual({ recommended: true })
    })

    test("should not duplicate adamantite in extends array", async () => {
      // Create config with adamantite already in extends
      await Bun.write(
        "biome.jsonc",
        JSON.stringify(
          {
            extends: ["adamantite", "@company/config"],
            rules: {
              recommended: true,
            },
          },
          null,
          2
        )
      )

      await biome.update()

      const content = await Bun.file("biome.jsonc").text()
      const config = JSON.parse(content)

      // Should not duplicate adamantite
      expect(config.extends).toEqual(["adamantite", "@company/config"])
      expect(config.rules).toEqual({ recommended: true })
    })

    test("should handle biome.json (without c extension)", async () => {
      // Create biome.json instead of biome.jsonc
      await Bun.write(
        "biome.json",
        JSON.stringify(
          {
            rules: {
              recommended: true,
            },
          },
          null,
          2
        )
      )

      // biome.exists() only checks for biome.jsonc, so this should be false
      const exists = await biome.exists()
      expect(exists).toBe(false)

      // But update should still work and convert to biome.jsonc
      await biome.update()

      // Should now exist as biome.jsonc
      const existsAfter = await biome.exists()
      expect(existsAfter).toBe(true)

      const content = await Bun.file("biome.jsonc").text()
      const config = JSON.parse(content)

      expect(config.extends).toEqual(["adamantite"])
      expect(config.rules).toEqual({ recommended: true })
    })
  })

  describe("tsconfig helper", () => {
    test("should detect when tsconfig.json does not exist", async () => {
      const exists = await tsconfig.exists()
      expect(exists).toBe(false)
    })

    test("should create tsconfig.json with correct config", async () => {
      await tsconfig.create()

      const exists = await tsconfig.exists()
      expect(exists).toBe(true)

      const content = await Bun.file("tsconfig.json").text()
      const config = JSON.parse(content)

      expect(config).toHaveProperty("extends")
      expect(config.extends).toBe("adamantite/presets/tsconfig.json")
    })

    test("should update existing tsconfig.json config", async () => {
      // Create initial config
      await Bun.write(
        "tsconfig.json",
        JSON.stringify(
          {
            compilerOptions: {
              target: "ES2020",
              strict: true,
            },
            include: ["src/**/*"],
          },
          null,
          2
        )
      )

      const existsBefore = await tsconfig.exists()
      expect(existsBefore).toBe(true)

      await tsconfig.update()

      const content = await Bun.file("tsconfig.json").text()
      const config = JSON.parse(content)

      // Should preserve existing config but add extends
      expect(config.compilerOptions).toEqual({
        target: "ES2020",
        strict: true,
      })
      expect(config.include).toEqual(["src/**/*"])
      expect(config.extends).toBe("adamantite/presets/tsconfig.json")
    })

    test("should preserve existing extends when updating", async () => {
      // Create config with existing extends
      await Bun.write(
        "tsconfig.json",
        JSON.stringify(
          {
            extends: "@company/tsconfig",
            compilerOptions: {
              target: "ES2020",
            },
          },
          null,
          2
        )
      )

      await tsconfig.update()

      const content = await Bun.file("tsconfig.json").text()
      const config = JSON.parse(content)

      // Our extends should override existing extends
      expect(config.extends).toBe("adamantite/presets/tsconfig.json")
      expect(config.compilerOptions).toEqual({ target: "ES2020" })
    })
  })

  describe("vscode helper", () => {
    test("should detect when .vscode/settings.json does not exist", async () => {
      const exists = await vscode.exists()
      expect(exists).toBe(false)
    })

    test("should create .vscode directory and settings.json", async () => {
      await vscode.create()

      const exists = await vscode.exists()
      expect(exists).toBe(true)

      const content = await Bun.file(".vscode/settings.json").text()
      const config = JSON.parse(content)

      // Use direct property access instead of toHaveProperty which seems to have issues
      expect(config["editor.formatOnSave"]).toBe(true)
      expect(config["editor.formatOnPaste"]).toBe(true)
      expect(config["editor.codeActionsOnSave"]).toBeDefined()
      expect(config["editor.codeActionsOnSave"]["quickfix.biome"]).toBe(
        "explicit"
      )
      expect(
        config[
          "[javascript][typescript][javascriptreact][typescriptreact][json][jsonc][css][graphql]"
        ]
      ).toBeDefined()
      expect(
        config[
          "[javascript][typescript][javascriptreact][typescriptreact][json][jsonc][css][graphql]"
        ]["editor.defaultFormatter"]
      ).toBe("biomejs.biome")
    })

    test("should update existing .vscode/settings.json config", async () => {
      // Create .vscode directory and initial settings
      mkdirSync(".vscode", { recursive: true })
      await Bun.write(
        ".vscode/settings.json",
        JSON.stringify(
          {
            "editor.fontSize": 14,
            "editor.formatOnSave": false,
            "workbench.theme": "dark",
          },
          null,
          2
        )
      )

      const existsBefore = await vscode.exists()
      expect(existsBefore).toBe(true)

      await vscode.update()

      const content = await Bun.file(".vscode/settings.json").text()
      const config = JSON.parse(content)

      // Should preserve existing settings that don't conflict
      expect(config["editor.fontSize"]).toBe(14)
      expect(config["workbench.theme"]).toBe("dark")

      // Should override formatOnSave with our value (true)
      expect(config["editor.formatOnSave"]).toBe(true)

      // Should add our settings
      expect(config["editor.codeActionsOnSave"]).toBeDefined()
      expect(config["editor.codeActionsOnSave"]["quickfix.biome"]).toBe(
        "explicit"
      )
    })

    test("should handle existing .vscode directory", async () => {
      // Create .vscode directory without settings.json
      mkdirSync(".vscode", { recursive: true })

      const existsBefore = await vscode.exists()
      expect(existsBefore).toBe(false)

      await vscode.create()

      const exists = await vscode.exists()
      expect(exists).toBe(true)

      const content = await Bun.file(".vscode/settings.json").text()
      const config = JSON.parse(content)

      expect(config["editor.formatOnSave"]).toBe(true)
      expect(config["editor.codeActionsOnSave"]).toBeDefined()
      expect(
        config[
          "[javascript][typescript][javascriptreact][typescriptreact][json][jsonc][css][graphql]"
        ]["editor.defaultFormatter"]
      ).toBe("biomejs.biome")
    })
  })
})
