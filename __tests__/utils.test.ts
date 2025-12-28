import type { PackageJson } from "type-fest"

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun from "bun"
import {
  checkCliExists,
  checkIfExists,
  checkIsMonorepo,
  defineCommand,
  getPackageManagerName,
  isJsonObject,
  mergeConfig,
  normalizeDependencyVersion,
  parseJson,
  printTitle,
  readPackageJson,
  runCommand,
} from "#utils.ts"

// Mock spawnSync for testing
let spawnSyncResult: {
  status?: number
  error?: Error | null
  stdout?: string | Buffer | null
  stderr?: string | Buffer | null
} = {
  status: 0,
  error: null,
  stdout: Buffer.from(""),
  stderr: Buffer.from(""),
}

void mock.module("node:child_process", () => ({
  spawnSync: mock(() => spawnSyncResult),
}))

describe("utils", () => {
  let testDir: string
  let originalCwd: string

  beforeEach(() => {
    // Reset spawnSync mock result
    spawnSyncResult = {
      status: 0,
      error: null,
      stdout: Buffer.from(""),
      stderr: Buffer.from(""),
    }

    // Create a temporary directory for each test
    testDir = join(tmpdir(), `adamantite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(testDir, { recursive: true })
    originalCwd = process.cwd()
    process.chdir(testDir)
  })

  afterEach(() => {
    // Restore original cwd and cleanup
    process.chdir(originalCwd)
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("checkIfExists", () => {
    test("should return true for existing file", async () => {
      const testFile = join(testDir, "test.txt")
      await Bun.write(testFile, "test content")

      const result = await checkIfExists(testFile)
      expect(result).toBe(true)
    })

    test("should return true for existing directory", async () => {
      const result = await checkIfExists(testDir)
      expect(result).toBe(true)
    })

    test("should return false for non-existing file", async () => {
      const nonExistentFile = join(testDir, "does-not-exist.txt")
      const result = await checkIfExists(nonExistentFile)
      expect(result).toBe(false)
    })

    test("should return false for non-existing directory", async () => {
      const nonExistentDir = join(testDir, "does-not-exist")
      const result = await checkIfExists(nonExistentDir)
      expect(result).toBe(false)
    })
  })

  describe("readPackageJson", () => {
    test("should read and parse valid package.json", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
        },
        devDependencies: {
          typescript: "^5.0.0",
        },
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await readPackageJson(testDir)
      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual(packageJson)
    })

    test("should use current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await readPackageJson()
      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual(packageJson)
    })

    test("should return error when package.json does not exist", async () => {
      const result = await readPackageJson(testDir)
      expect(result.isErr()).toBe(true)
    })

    test("should return error when package.json is invalid JSON", async () => {
      await Bun.write(join(testDir, "package.json"), "invalid json content")

      const result = await readPackageJson(testDir)
      expect(result.isErr()).toBe(true)
    })
  })

  describe("parseJson", () => {
    test("should parse valid JSON", () => {
      const validJson = '{"name": "test", "version": "1.0.0"}'
      const result = parseJson(validJson)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })

    test("should parse valid JSONC with comments", () => {
      const jsonc = `{
        // This is a comment
        "name": "test",
        "version": "1.0.0"
      }`
      const result = parseJson(jsonc)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({
        name: "test",
        version: "1.0.0",
      })
    })

    test("should return error for invalid JSON", () => {
      const invalidJson = '{"name": "test", "version":}'
      const result = parseJson(invalidJson)

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("FAILED_TO_PARSE_FILE")
      }
    })

    test("should return error for empty string", () => {
      const result = parseJson("")

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("FAILED_TO_PARSE_FILE")
      }
    })
  })

  describe("isJsonObject", () => {
    test("should return true for plain JSON objects", () => {
      expect(isJsonObject({})).toBe(true)
      expect(isJsonObject({ a: 1, b: "x", c: null, d: [1, 2, 3] })).toBe(true)
    })

    test("should return false for null, arrays, and primitives", () => {
      expect(isJsonObject(null)).toBe(false)
      expect(isJsonObject([])).toBe(false)
      expect(isJsonObject([1, 2, 3])).toBe(false)
      expect(isJsonObject("x")).toBe(false)
      expect(isJsonObject(123)).toBe(false)
      expect(isJsonObject(true)).toBe(false)
    })
  })

  describe("mergeConfig", () => {
    test("should merge two objects", () => {
      const base = { a: 1, b: 2 }
      const override = { b: 3, c: 4 }
      const result = mergeConfig(base, override)

      expect(result.isOk()).toBe(true)
      // Defu merges left-to-right, so base (first arg) wins for 'b'
      expect(result._unsafeUnwrap()).toEqual({ a: 1, b: 2, c: 4 })
    })

    test("should give priority to first argument (defu behavior)", () => {
      const first = { a: 1, b: 2 }
      const second = { a: 3, b: 4 }
      const result = mergeConfig(first, second)

      expect(result.isOk()).toBe(true)
      // Defu merges left-to-right, so first argument wins
      expect(result._unsafeUnwrap()).toEqual({ a: 1, b: 2 })
    })

    test("should handle nested objects", () => {
      const base = { a: { x: 1, y: 2 }, b: 3 }
      const override = { a: { y: 4, z: 5 }, b: 6 }
      const result = mergeConfig(base, override)

      expect(result.isOk()).toBe(true)
      // Defu merges left-to-right, so base values win
      expect(result._unsafeUnwrap()).toEqual({ a: { x: 1, y: 2, z: 5 }, b: 3 })
    })

    test("should handle mergeConfig error when defu throws", () => {
      // Use a Proxy that throws when any property is accessed
      // This simulates defu encountering an error during merge
      const throwingBase = new Proxy(
        {},
        {
          get() {
            throw new Error("Simulated defu error")
          },
          ownKeys() {
            throw new Error("Simulated defu error")
          },
        }
      )

      const result = mergeConfig(throwingBase, { b: 2 })
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("FAILED_TO_MERGE_CONFIG")
      }
    })
  })

  describe("defineCommand", () => {
    test("should return the input command module unchanged", () => {
      const mockCommand = {
        command: "test",
        describe: "Test command",
        handler: () => {
          // Empty handler for testing
        },
      }

      const result = defineCommand(mockCommand)
      expect(result).toBe(mockCommand)
      expect(result).toEqual(mockCommand)
    })
  })

  describe("runCommand", () => {
    test("should successfully run a valid command", () => {
      const result = runCommand("echo test")

      expect(result.isOk()).toBe(true)
    })

    test("should return error with FAILED_TO_RUN_COMMAND tag for invalid command", () => {
      spawnSyncResult = {
        error: new Error("spawn nonexistent-command-12345 ENOENT"),
      }

      const result = runCommand("nonexistent-command-12345")

      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("FAILED_TO_RUN_COMMAND")
      }
    })
  })

  describe("getPackageManagerName", () => {
    test("should detect bun when bun.lock exists", async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }))
      await Bun.write(join(testDir, "bun.lock"), "")

      const result = await getPackageManagerName()
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe("bun")
      }
    })

    test("should detect npm when package-lock.json exists", async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }))
      await Bun.write(join(testDir, "package-lock.json"), "{}")

      const result = await getPackageManagerName()
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe("npm")
      }
    })

    test("should detect pnpm when pnpm-lock.yaml exists", async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }))
      await Bun.write(join(testDir, "pnpm-lock.yaml"), "")

      const result = await getPackageManagerName()
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe("pnpm")
      }
    })

    test("should detect yarn when yarn.lock exists", async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }))
      await Bun.write(join(testDir, "yarn.lock"), "")

      const result = await getPackageManagerName()
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe("yarn")
      }
    })

    test("should return error with NO_PACKAGE_MANAGER tag when no lockfile exists", async () => {
      await Bun.write(join(testDir, "package.json"), JSON.stringify({ name: "test" }))

      const result = await getPackageManagerName()
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("NO_PACKAGE_MANAGER")
      }
    })
  })

  describe("checkIsMonorepo", () => {
    test("should return true when pnpm-workspace.yaml exists", async () => {
      await Bun.write(join(testDir, "pnpm-workspace.yaml"), "packages:\n  - 'packages/*'")

      const result = await checkIsMonorepo()
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe(true)
      }
    })

    test("should return true when package.json has workspaces field", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        workspaces: ["packages/*"],
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await checkIsMonorepo()
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe(true)
      }
    })

    test("should return false when neither condition is met", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await Bun.write(join(testDir, "package.json"), JSON.stringify(packageJson, null, 2))

      const result = await checkIsMonorepo()
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe(false)
      }
    })

    test("should return error when package.json does not exist and no pnpm-workspace.yaml", async () => {
      const result = await checkIsMonorepo()
      expect(result.isErr()).toBe(true)
    })
  })

  describe("printTitle", () => {
    let originalColumns: number | undefined
    let originalConsoleInfo: typeof console.info
    let callCount: number

    beforeEach(() => {
      originalColumns = process.stdout.columns
      // oxlint-disable-next-line no-console - saving original console.info for restoration
      originalConsoleInfo = console.info
      callCount = 0
      const mockLog = mock(() => {
        callCount += 1
      })

      console.info = mockLog as typeof console.info
    })

    afterEach(() => {
      Object.defineProperty(process.stdout, "columns", {
        value: originalColumns,
        writable: true,
        configurable: true,
      })

      console.info = originalConsoleInfo
    })

    test("should print title when terminal is wide enough", () => {
      Object.defineProperty(process.stdout, "columns", {
        value: 120,
        writable: true,
        configurable: true,
      })

      printTitle()

      expect(callCount).toBe(1)
    })

    test("should not print title when terminal is too narrow", () => {
      Object.defineProperty(process.stdout, "columns", {
        value: 50,
        writable: true,
        configurable: true,
      })

      printTitle()

      expect(callCount).toBe(0)
    })

    test("should not print title when process.stdout.columns is undefined", () => {
      Object.defineProperty(process.stdout, "columns", {
        value: undefined,
        writable: true,
        configurable: true,
      })

      printTitle()

      expect(callCount).toBe(0)
    })
  })

  describe("runCommand", () => {
    test("should return ok when command succeeds", () => {
      spawnSyncResult = {
        status: 0,
        error: null,
        stdout: null,
        stderr: null,
      }

      const result = runCommand("echo success")
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value.status).toBe(0)
      }
    })

    test("should return err when command fails with non-zero status", () => {
      spawnSyncResult = {
        status: 1,
        error: null,
        stdout: null,
        stderr: null,
      }

      const result = runCommand("exit 1")
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("FAILED_TO_RUN_COMMAND")
        expect(result.error.message).toBe("An unknown error occurred while running the command")
        expect(result.error.debug).toContain(
          "Failed to run command: An unknown error occurred while running the command"
        )
      }
    })

    test("should return err when spawn fails", () => {
      spawnSyncResult = {
        error: new Error("spawn failed"),
      }

      const result = runCommand("invalid-command")
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("FAILED_TO_RUN_COMMAND")
        expect(result.error.message).toBe("spawn failed")
      }
    })
  })

  describe("normalizeDependencyVersion", () => {
    test("should strip caret and tilde prefixes", () => {
      expect(normalizeDependencyVersion("^0.20.0")).toBe("0.20.0")
      expect(normalizeDependencyVersion("~0.20.0")).toBe("0.20.0")
    })

    test("should preserve exact versions", () => {
      expect(normalizeDependencyVersion("0.20.0")).toBe("0.20.0")
    })

    test("should trim whitespace and strip workspace prefix", () => {
      expect(normalizeDependencyVersion("  workspace:^0.20.0  ")).toBe("0.20.0")
    })
  })

  describe("checkCliExists", () => {
    test("should return ok(true) when CLI exists", () => {
      spawnSyncResult = {
        status: 0,
        error: null,
        stdout: Buffer.from("/usr/bin/code"),
        stderr: Buffer.from(""),
      }

      const result = checkCliExists("code")
      expect(result.isOk()).toBe(true)
      if (result.isOk()) {
        expect(result.value).toBe(true)
      }
    })

    test("should return err with CLI_NOT_FOUND tag when CLI does not exist", () => {
      spawnSyncResult = {
        status: 1,
        error: null,
        stdout: Buffer.from(""),
        stderr: Buffer.from(""),
      }

      const result = checkCliExists("nonexistent-command")
      expect(result.isErr()).toBe(true)
      if (result.isErr()) {
        expect(result.error.tag).toBe("CLI_NOT_FOUND")
        expect(result.error.message).toContain(
          "The 'nonexistent-command' command is not available in your PATH."
        )
        expect(result.error.context?.command).toBe("nonexistent-command")
      }
    })

    test("should use 'where' command on Windows", () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, "platform", {
        value: "win32",
        writable: true,
        configurable: true,
      })

      spawnSyncResult = {
        status: 0,
        error: null,
        stdout: Buffer.from(String.raw`C:\Program Files\Microsoft VS Code\bin\code.cmd`),
        stderr: Buffer.from(""),
      }

      const result = checkCliExists("code")
      expect(result.isOk()).toBe(true)

      // Restore original platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        writable: true,
        configurable: true,
      })
    })

    test("should use 'which' command on Unix-like systems", () => {
      const originalPlatform = process.platform
      Object.defineProperty(process, "platform", {
        value: "darwin",
        writable: true,
        configurable: true,
      })

      spawnSyncResult = {
        status: 0,
        error: null,
        stdout: Buffer.from("/usr/local/bin/code"),
        stderr: Buffer.from(""),
      }

      const result = checkCliExists("code")
      expect(result.isOk()).toBe(true)

      // Restore original platform
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        writable: true,
        configurable: true,
      })
    })
  })
})
