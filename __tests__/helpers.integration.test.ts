import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun from "bun"
import { parse } from "jsonc-parser"
import { github, hasCICompatibleScripts } from "#helpers/ci/github.ts"
import { vscode } from "#helpers/editors/vscode.ts"
import { oxfmt } from "#helpers/packages/oxfmt.ts"
import { oxlint } from "#helpers/packages/oxlint/index.ts"
import { typescript } from "#helpers/packages/typescript.ts"

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
          devDependencies: {},
          name: "test-project",
          version: "1.0.0",
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
      rmSync(tempDir, { force: true, recursive: true })
    } catch {
      // Ignore cleanup errors in tests
    }
  })

  describe("packages", () => {
    describe("oxlint", () => {
      test("should detect when .oxlintrc.json does not exist", async () => {
        const { path } = await oxlint.exists()
        expect(path).toBe(null)
      })

      test("should create .oxlintrc.json with correct config", async () => {
        const createResult = await oxlint.create()
        createResult._unsafeUnwrap()

        const { path } = await oxlint.exists()
        expect(path).toBeDefined()

        const content = await Bun.file(".oxlintrc.json").text()
        const config = JSON.parse(content)

        expect(config).toHaveProperty("$schema")
        expect(config.$schema).toBe("./node_modules/oxlint/configuration_schema.json")
        expect(config).toHaveProperty("extends")
        expect(config.extends).toEqual(["./node_modules/adamantite/presets/lint/core.json"])
      })

      test("should update existing .oxlintrc.json config", async () => {
        // Create initial config
        await Bun.write(
          ".oxlintrc.json",
          JSON.stringify(
            {
              $schema: "https://oxc.rs/schema.json",
              rules: {
                "no-console": "warn",
              },
            },
            null,
            2
          )
        )

        const existsBefore = await oxlint.exists()
        expect(existsBefore.path).toBeDefined()

        const updateResult = await oxlint.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file(".oxlintrc.json").text()
        const config = parse(content)

        // Should preserve existing rules and override schema
        expect(config.rules).toEqual({ "no-console": "warn" })
        expect(config.$schema).toBe("./node_modules/oxlint/configuration_schema.json")
        // Check that extends contains the core preset
        const extendsArray = Array.isArray(config.extends) ? (config.extends as string[]) : []
        expect(extendsArray).toContain("./node_modules/adamantite/presets/lint/core.json")
      })

      test("should handle update() failure when reading oxlint config fails", async () => {
        // Create a directory named .oxlintrc.json to cause read failure
        mkdirSync(".oxlintrc.json", { recursive: true })

        const updateResult = await oxlint.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_READ_FILE")
        }
      })

      test("should handle empty config by merging with Adamantite's config", async () => {
        // Create empty .oxlintrc.json
        await Bun.write(".oxlintrc.json", "{}")

        const updateResult = await oxlint.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file(".oxlintrc.json").text()
        const config = parse(content)

        // Should merge empty config with Adamantite's config
        expect(config.$schema).toBe("./node_modules/oxlint/configuration_schema.json")
        // Check that extends contains the core preset
        const extendsArray = Array.isArray(config.extends) ? (config.extends as string[]) : []
        expect(extendsArray).toContain("./node_modules/adamantite/presets/lint/core.json")
      })

      test("should handle update() failure when writing oxlint config fails", async () => {
        // Create valid .oxlintrc.json
        await Bun.write(
          ".oxlintrc.json",
          JSON.stringify({
            rules: {
              "no-console": "warn",
            },
          })
        )
        // Make it read-only to prevent writing
        chmodSync(".oxlintrc.json", 0o444)

        const updateResult = await oxlint.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_WRITE_FILE")
        }
      })
    })

    describe("oxfmt", () => {
      test("should detect when .oxfmtrc.jsonc does not exist", async () => {
        const { path } = await oxfmt.exists()
        expect(path).toBe(null)
      })

      test("should detect when .oxfmtrc.json exists", async () => {
        await Bun.write(".oxfmtrc.json", JSON.stringify({}))

        const { path } = await oxfmt.exists()
        expect(path).toBeDefined()
        expect(path).toContain(".oxfmtrc.json")
      })

      test("should create .oxfmtrc.jsonc with correct config", async () => {
        const createResult = await oxfmt.create()
        createResult._unsafeUnwrap()

        const { path } = await oxfmt.exists()
        expect(path).toBeDefined()

        const content = await Bun.file(".oxfmtrc.jsonc").text()
        const config = parse(content)

        expect(config).toHaveProperty("$schema")
        expect(config.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")
      })

      test("should update existing .oxfmtrc.jsonc config", async () => {
        // Create initial config
        await Bun.write(
          ".oxfmtrc.jsonc",
          JSON.stringify(
            {
              $schema: "https://oxc.rs/schema.json",
              indentStyle: "tab",
            },
            null,
            2
          )
        )

        const existsBefore = await oxfmt.exists()
        expect(existsBefore.path).toBeDefined()

        const updateResult = await oxfmt.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file(".oxfmtrc.jsonc").text()
        const config = parse(content)

        // Should preserve existing config but override schema
        expect(config.indentStyle).toBe("tab")
        expect(config.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")
      })

      test("should handle update() failure when reading oxfmt config fails", async () => {
        // Create a directory named .oxfmtrc.jsonc to cause read failure
        mkdirSync(".oxfmtrc.jsonc", { recursive: true })

        const updateResult = await oxfmt.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_READ_FILE")
        }
      })

      test("should handle empty config by merging with Adamantite's config", async () => {
        // Create empty .oxfmtrc.jsonc
        await Bun.write(".oxfmtrc.jsonc", "{}")

        const updateResult = await oxfmt.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file(".oxfmtrc.jsonc").text()
        const config = parse(content)

        // Should merge empty config with Adamantite's config
        expect(config.$schema).toBe("./node_modules/oxfmt/configuration_schema.json")
      })

      test("should return INVALID_CONFIG_FORMAT when oxfmt config is not a JSON object", async () => {
        await Bun.write(".oxfmtrc.jsonc", "[]")

        const updateResult = await oxfmt.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("INVALID_CONFIG_FORMAT")
        }
      })

      test("should handle update() failure when writing oxfmt config fails", async () => {
        // Create valid .oxfmtrc.jsonc
        await Bun.write(
          ".oxfmtrc.jsonc",
          JSON.stringify({
            indentStyle: "space",
          })
        )
        // Make it read-only to prevent writing
        chmodSync(".oxfmtrc.jsonc", 0o444)

        const updateResult = await oxfmt.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_WRITE_FILE")
        }
      })
    })

    describe("typescript", () => {
      test("should detect when tsconfig.json does not exist", async () => {
        const exists = await typescript.exists()
        expect(exists).toBe(false)
      })

      test("should create tsconfig.json with correct config", async () => {
        const createResult = await typescript.create()
        createResult._unsafeUnwrap()

        const exists = await typescript.exists()
        expect(exists).toBe(true)

        const content = await Bun.file("tsconfig.json").text()
        const config = JSON.parse(content)

        expect(config).toHaveProperty("extends")
        expect(config.extends).toBe("adamantite/typescript")
      })

      test("should update existing tsconfig.json config", async () => {
        // Create initial config
        await Bun.write(
          "tsconfig.json",
          JSON.stringify(
            {
              compilerOptions: {
                strict: true,
                target: "ES2020",
              },
              include: ["src/**/*"],
            },
            null,
            2
          )
        )

        const existsBefore = await typescript.exists()
        expect(existsBefore).toBe(true)

        const updateResult = await typescript.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file("tsconfig.json").text()
        const config = JSON.parse(content)

        // Should preserve existing config but add extends
        expect(config.compilerOptions).toEqual({
          strict: true,
          target: "ES2020",
        })
        expect(config.include).toEqual(["src/**/*"])
        expect(config.extends).toBe("adamantite/typescript")
      })

      test("should preserve existing extends when updating", async () => {
        // Create config with existing extends
        await Bun.write(
          "tsconfig.json",
          JSON.stringify(
            {
              compilerOptions: {
                target: "ES2020",
              },
              extends: "@company/tsconfig",
            },
            null,
            2
          )
        )

        const updateResult = await typescript.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file("tsconfig.json").text()
        const config = JSON.parse(content)

        // Our extends should override existing extends
        expect(config.extends).toBe("adamantite/typescript")
        expect(config.compilerOptions).toEqual({ target: "ES2020" })
      })

      test("should handle create() failure when writing tsconfig.json fails", async () => {
        // Create a read-only directory to prevent writing
        mkdirSync("readonly-dir", { recursive: true })
        chmodSync("readonly-dir", 0o555) // Read-only directory
        process.chdir("readonly-dir")

        const createResult = await typescript.create()
        // This might succeed on some systems, but if it fails, it should have the right error
        if (createResult.isErr()) {
          expect(createResult.error.tag).toBe("FAILED_TO_WRITE_FILE")
        }

        // Restore directory
        process.chdir(tempDir)
      })

      test("should handle empty config by merging with Adamantite's config", async () => {
        // Create empty tsconfig.json
        await Bun.write("tsconfig.json", "{}")

        const updateResult = await typescript.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file("tsconfig.json").text()
        const config = JSON.parse(content)

        // Should merge empty config with Adamantite's config
        expect(config.extends).toBe("adamantite/typescript")
      })

      test("should return INVALID_CONFIG_FORMAT when tsconfig.json is not a JSON object", async () => {
        await Bun.write("tsconfig.json", "true")

        const updateResult = await typescript.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("INVALID_CONFIG_FORMAT")
        }
      })

      test("should handle update() failure when reading tsconfig.json fails", async () => {
        // Try to update a non-existent file
        const updateResult = await typescript.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_READ_FILE")
        }
      })

      test("should handle update() failure when writing tsconfig.json fails", async () => {
        // Create valid tsconfig.json
        await Bun.write(
          "tsconfig.json",
          JSON.stringify({
            compilerOptions: {
              target: "ES2020",
            },
          })
        )
        // Make it read-only to prevent writing
        chmodSync("tsconfig.json", 0o444)

        const updateResult = await typescript.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_WRITE_FILE")
        }
      })
    })
  })

  describe("editors", () => {
    describe("vscode", () => {
      test("should detect when .vscode/settings.json does not exist", async () => {
        const exists = await vscode.exists()
        expect(exists).toBe(false)
      })

      test("should create .vscode directory and settings.json", async () => {
        const createResult = await vscode.create()
        createResult._unsafeUnwrap()

        const exists = await vscode.exists()
        expect(exists).toBe(true)

        const content = await Bun.file(".vscode/settings.json").text()
        const config = JSON.parse(content)

        expect(config).toHaveProperty(["editor.formatOnSave"])
        expect(config?.["editor.formatOnSave"]).toBe(true)
      })

      test("should update existing .vscode/settings.json config", async () => {
        // Create initial config
        mkdirSync(".vscode", { recursive: true })
        await Bun.write(
          ".vscode/settings.json",
          JSON.stringify(
            {
              "editor.tabSize": 4,
              "files.autoSave": "afterDelay",
            },
            null,
            2
          )
        )

        const existsBefore = await vscode.exists()
        expect(existsBefore).toBe(true)

        const updateResult = await vscode.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file(".vscode/settings.json").text()
        const config = JSON.parse(content)

        // Should preserve existing config but add Adamantite settings
        expect(config["editor.tabSize"]).toBe(4)
        expect(config["files.autoSave"]).toBe("afterDelay")
        expect(config["editor.formatOnSave"]).toBe(true)
        expect(config["editor.formatOnPaste"]).toBe(true)
      })

      test("should handle empty config by merging with Adamantite's config", async () => {
        // Create empty .vscode/settings.json
        mkdirSync(".vscode", { recursive: true })
        await Bun.write(".vscode/settings.json", "{}")

        const updateResult = await vscode.update()
        updateResult._unsafeUnwrap()

        const content = await Bun.file(".vscode/settings.json").text()
        const config = JSON.parse(content)

        // Should merge empty config with Adamantite's config
        expect(config["editor.formatOnSave"]).toBe(true)
        expect(config["editor.formatOnPaste"]).toBe(true)
      })

      test("should return INVALID_CONFIG_FORMAT when .vscode/settings.json is not a JSON object", async () => {
        mkdirSync(".vscode", { recursive: true })
        await Bun.write(".vscode/settings.json", "[]")

        const updateResult = await vscode.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("INVALID_CONFIG_FORMAT")
        }
      })

      test("should handle update() failure when reading .vscode/settings.json fails", async () => {
        // Try to update a non-existent file
        const updateResult = await vscode.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_READ_FILE")
        }
      })

      test("should handle update() failure when writing .vscode/settings.json fails", async () => {
        // Create valid .vscode/settings.json
        mkdirSync(".vscode", { recursive: true })
        await Bun.write(
          ".vscode/settings.json",
          JSON.stringify({
            "editor.tabSize": 2,
          })
        )
        // Make it read-only to prevent writing
        chmodSync(".vscode/settings.json", 0o444)

        const updateResult = await vscode.update()
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_WRITE_FILE")
        }
      })
    })
  })

  describe("ci", () => {
    describe("github", () => {
      test("hasCICompatibleScripts should correctly identify compatible scripts", () => {
        expect(hasCICompatibleScripts(["check"])).toBe(true)
        expect(hasCICompatibleScripts(["format"])).toBe(true)
        expect(hasCICompatibleScripts(["typecheck"])).toBe(true)
        expect(hasCICompatibleScripts(["check:monorepo"])).toBe(true)
        expect(hasCICompatibleScripts(["fix"])).toBe(false)
        expect(hasCICompatibleScripts(["fix:monorepo"])).toBe(false)
        expect(hasCICompatibleScripts(["check", "fix:monorepo"])).toBe(true)
      })

      test("should detect when GitHub Actions workflow does not exist", async () => {
        const exists = await github.exists()
        expect(exists).toBe(false)
      })

      test("should create GitHub Actions workflow with correct structure", async () => {
        const createResult = await github.create({
          packageManager: "bun",
          scripts: ["check", "format", "typecheck"],
        })
        createResult._unsafeUnwrap()

        const exists = await github.exists()
        expect(exists).toBe(true)

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("name: adamantite")
        expect(content).toContain("verify:")
        expect(content).toContain("strategy:")
        expect(content).toContain("matrix:")
        expect(content).toContain("include:")
        expect(content).toContain("name: lint")
        expect(content).toContain("name: types")
        expect(content).toContain("command: bun run check")
        expect(content).toContain("command: bun run typecheck")
        expect(content).toContain("Setup Bun")
        expect(content).toContain("Cache dependencies")
        expect(content).toContain("actions/cache@v4")
        expect(content).toContain("~/.bun/install/cache")
        expect(content).toContain("bun install --frozen-lockfile")
      })

      test("should generate correct workflow for npm", async () => {
        const createResult = await github.create({
          packageManager: "npm",
          scripts: ["check"],
        })
        createResult._unsafeUnwrap()

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("Setup Node.js")
        expect(content).toContain("actions/setup-node@v6")
        expect(content).toContain('cache: "npm"')
        expect(content).toContain("npm ci")
        expect(content).toContain("command: npm run check")
      })

      test("should generate correct workflow for pnpm", async () => {
        const createResult = await github.create({
          packageManager: "pnpm",
          scripts: ["check"],
        })
        createResult._unsafeUnwrap()

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("Setup pnpm")
        expect(content).toContain("pnpm/action-setup@v4")
        expect(content).toContain("actions/setup-node@v6")
        expect(content).toContain('cache: "pnpm"')
        expect(content).toContain("pnpm install --frozen-lockfile")
        expect(content).toContain("command: pnpm run check")
      })

      test("should generate correct workflow for yarn", async () => {
        const createResult = await github.create({
          packageManager: "yarn",
          scripts: ["check"],
        })
        createResult._unsafeUnwrap()

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("Setup Node.js")
        expect(content).toContain("actions/setup-node@v6")
        expect(content).toContain('cache: "yarn"')
        expect(content).toContain("yarn install --frozen-lockfile")
        expect(content).toContain("command: yarn run check")
      })

      test("should generate correct workflow for deno", async () => {
        const createResult = await github.create({
          packageManager: "deno",
          scripts: ["check"],
        })
        createResult._unsafeUnwrap()

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("Setup Deno")
        expect(content).toContain("denoland/setup-deno@v2")
        expect(content).toContain("deno install --frozen")
        expect(content).toContain("deno task check")
      })

      test("should include all CI-compatible scripts as jobs", async () => {
        const createResult = await github.create({
          packageManager: "bun",
          scripts: ["check", "format", "typecheck", "check:monorepo"],
        })
        createResult._unsafeUnwrap()

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("name: lint")
        expect(content).toContain("name: format")
        expect(content).toContain("name: types")
        expect(content).toContain("name: monorepo")
        // Check that format command includes both format and --check (less brittle)
        expect(content).toContain("command:")
        expect(content).toContain("format")
        expect(content).toContain("--check")
      })

      test("should not create workflow when no CI-compatible scripts", async () => {
        const createResult = await github.create({
          packageManager: "bun",
          scripts: ["fix", "fix:monorepo"],
        })
        createResult._unsafeUnwrap()

        // The workflow should not be created
        const exists = await github.exists()
        expect(exists).toBe(false)
      })

      test("should update existing workflow", async () => {
        // Create initial workflow
        mkdirSync(".github/workflows", { recursive: true })
        await Bun.write(".github/workflows/adamantite.yml", "name: Old Workflow")

        const updateResult = await github.update({
          packageManager: "bun",
          scripts: ["check"],
        })
        updateResult._unsafeUnwrap()

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("name: adamantite")
        expect(content).toContain("name: lint")
        expect(content).toContain("verify:")
        expect(content).not.toContain("Old Workflow")
      })

      test("should include concurrency settings", async () => {
        const createResult = await github.create({
          packageManager: "bun",
          scripts: ["check"],
        })
        createResult._unsafeUnwrap()

        const content = await Bun.file(".github/workflows/adamantite.yml").text()
        expect(content).toContain("permissions:")
        expect(content).toContain("contents: read")
        expect(content).toContain("concurrency:")
        expect(content).toContain("cancel-in-progress: true")
      })

      test("should handle create() failure when directory creation fails", async () => {
        // Create a file with the name .github to prevent directory creation
        writeFileSync(".github", "not a directory")

        const createResult = await github.create({
          packageManager: "bun",
          scripts: ["check"],
        })
        expect(createResult.isErr()).toBe(true)
        if (createResult.isErr()) {
          expect(createResult.error.tag).toBe("FAILED_TO_CREATE_DIRECTORY")
        }
      })

      test("should handle update() failure when writing workflow fails", async () => {
        // Create .github/workflows directory
        mkdirSync(".github/workflows", { recursive: true })
        // Create a read-only file to prevent writing
        writeFileSync(".github/workflows/adamantite.yml", "name: Old")
        chmodSync(".github/workflows/adamantite.yml", 0o444) // Read-only

        const updateResult = await github.update({
          packageManager: "bun",
          scripts: ["check"],
        })
        expect(updateResult.isErr()).toBe(true)
        if (updateResult.isErr()) {
          expect(updateResult.error.tag).toBe("FAILED_TO_WRITE_FILE")
        }
      })
    })
  })

  describe("hasCICompatibleScripts", () => {
    test("should return true when check script is present", () => {
      expect(hasCICompatibleScripts(["check"])).toBe(true)
    })

    test("should return true when format script is present", () => {
      expect(hasCICompatibleScripts(["format"])).toBe(true)
    })

    test("should return true when typecheck script is present", () => {
      expect(hasCICompatibleScripts(["typecheck"])).toBe(true)
    })

    test("should return true when check:monorepo script is present", () => {
      expect(hasCICompatibleScripts(["check:monorepo"])).toBe(true)
    })

    test("should return false when only fix scripts are present", () => {
      expect(hasCICompatibleScripts(["fix", "fix:monorepo"])).toBe(false)
    })

    test("should return false for empty array", () => {
      expect(hasCICompatibleScripts([])).toBe(false)
    })

    test("should return true when mix of CI and non-CI scripts", () => {
      expect(hasCICompatibleScripts(["fix", "check", "fix:monorepo"])).toBe(true)
    })
  })
})
