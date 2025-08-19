import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import Bun from "bun"
import { spawnSync } from "node:child_process"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import {
  exists,
  readPackageJson,
  runProcess,
  writePackageJson,
} from "../src/utils"

// Mock spawnSync for testing
mock.module("node:child_process", () => ({
  spawnSync: mock(() => ({
    status: 0,
    error: null,
  })),
}))

describe("utils", () => {
  let testDir: string
  let originalCwd: string

  beforeEach(() => {
    // Create a temporary directory for each test
    testDir = join(
      tmpdir(),
      `adamantite-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    )
    mkdirSync(testDir, { recursive: true })
    originalCwd = process.cwd()
    process.chdir(testDir)
  })

  afterEach(() => {
    // Restore original cwd and cleanup
    process.chdir(originalCwd)
    rmSync(testDir, { recursive: true, force: true })
  })

  describe("runProcess", () => {
    test("should execute command with default options", () => {
      const mockSpawnSync = spawnSync as unknown as ReturnType<typeof mock>
      mockSpawnSync.mockClear()

      runProcess("echo", ["hello"])

      expect(mockSpawnSync).toHaveBeenCalledWith("echo", ["hello"], {
        stdio: "inherit",
      })
    })

    test("should execute command with custom options", () => {
      const mockSpawnSync = spawnSync as unknown as ReturnType<typeof mock>
      mockSpawnSync.mockClear()

      const customOptions = { cwd: "/tmp", env: { NODE_ENV: "test" } }
      runProcess("npm", ["install"], customOptions)

      expect(mockSpawnSync).toHaveBeenCalledWith("npm", ["install"], {
        ...customOptions,
        stdio: "inherit",
      })
    })

    test("should handle command with no args", () => {
      const mockSpawnSync = spawnSync as unknown as ReturnType<typeof mock>
      mockSpawnSync.mockClear()

      runProcess("ls")

      expect(mockSpawnSync).toHaveBeenCalledWith("ls", [], { stdio: "inherit" })
    })

    test("should handle multiple args", () => {
      const mockSpawnSync = spawnSync as unknown as ReturnType<typeof mock>
      mockSpawnSync.mockClear()

      runProcess("git", ["add", ".", "--all"])

      expect(mockSpawnSync).toHaveBeenCalledWith("git", ["add", ".", "--all"], {
        stdio: "inherit",
      })
    })

    test("should throw error when process fails", () => {
      const mockSpawnSync = spawnSync as unknown as ReturnType<typeof mock>
      mockSpawnSync.mockReturnValue({
        status: 1,
        error: null,
      })

      expect(() => runProcess("failing-command")).toThrow(
        "Process exited with code 1"
      )
    })

    test("should throw error when spawn fails", () => {
      const mockSpawnSync = spawnSync as unknown as ReturnType<typeof mock>
      const spawnError = new Error("ENOENT: no such file or directory")
      mockSpawnSync.mockReturnValue({
        status: null,
        error: spawnError,
      })

      expect(() => runProcess("nonexistent-command")).toThrow(spawnError)
    })
  })

  describe("exists", () => {
    test("should return true for existing file", async () => {
      const testFile = join(testDir, "test.txt")
      await Bun.write(testFile, "test content")

      const result = await exists(testFile)
      expect(result).toBe(true)
    })

    test("should return true for existing directory", async () => {
      const result = await exists(testDir)
      expect(result).toBe(true)
    })

    test("should return false for non-existing file", async () => {
      const nonExistentFile = join(testDir, "does-not-exist.txt")
      const result = await exists(nonExistentFile)
      expect(result).toBe(false)
    })

    test("should return false for non-existing directory", async () => {
      const nonExistentDir = join(testDir, "does-not-exist")
      const result = await exists(nonExistentDir)
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

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await readPackageJson(testDir)
      expect(result).toEqual(packageJson)
    })

    test("should use current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await readPackageJson()
      expect(result).toEqual(packageJson)
    })

    test("should throw error when package.json does not exist", async () => {
      await expect(readPackageJson(testDir)).rejects.toThrow(
        "package.json not found in the current directory"
      )
    })

    test("should throw error when package.json is invalid JSON", async () => {
      await Bun.write(join(testDir, "package.json"), "invalid json content")

      await expect(readPackageJson(testDir)).rejects.toThrow(
        "Failed to parse package.json"
      )
    })
  })

  describe("writePackageJson", () => {
    test("should write package.json with proper formatting", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
        },
      }

      await writePackageJson(packageJson, testDir)

      const written = await Bun.file(join(testDir, "package.json")).text()
      const parsed = JSON.parse(written)
      expect(parsed).toEqual(packageJson)

      // Check formatting (should be pretty-printed with 2 spaces)
      expect(written).toContain('  "name": "test-package"')
    })

    test("should use current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      await writePackageJson(packageJson)

      const written = await Bun.file(join(testDir, "package.json")).text()
      const parsed = JSON.parse(written)
      expect(parsed).toEqual(packageJson)
    })

    test("should write and read updated content correctly", async () => {
      const originalPackageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      const updatedPackageJson: PackageJson = {
        name: "test-package",
        version: "2.0.0",
      }

      // Write initial content
      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(originalPackageJson, null, 2)
      )

      // Verify initial content
      const initialResult = await readPackageJson(testDir)
      expect(initialResult).toEqual(originalPackageJson)

      // Write updated content
      await writePackageJson(updatedPackageJson, testDir)

      // Read again should return updated content from disk
      const result = await readPackageJson(testDir)
      expect(result).toEqual(updatedPackageJson)
    })

    test("should throw error when write fails", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
      }

      // Try to write to non-existent directory
      const invalidDir = join(testDir, "non-existent", "directory")
      await expect(writePackageJson(packageJson, invalidDir)).rejects.toThrow(
        "Failed to write package.json"
      )
    })
  })
})
