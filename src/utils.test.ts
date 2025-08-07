import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import Bun from "bun"
import { execSync } from "node:child_process"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import {
  BIOME_VERSION,
  exists,
  getInstalledPackageVersion,
  isPackageInstalled,
  isPackageVersionCorrect,
  readPackageJson,
  runProcess,
  writePackageJson,
} from "./utils"

// Mock execSync for testing
mock.module("node:child_process", () => ({
  execSync: mock(() => {
    // Mock implementation
  }),
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

  describe("BIOME_VERSION", () => {
    test("should match the Biome version in package.json", async () => {
      const projectRoot = join(__dirname, "..")
      const packageJson = await readPackageJson(projectRoot)

      const biomeVersionInPackageJson =
        packageJson.devDependencies?.["@biomejs/biome"]

      expect(biomeVersionInPackageJson).toBeDefined()
      expect(BIOME_VERSION).toBe(biomeVersionInPackageJson as string)
      expect(typeof BIOME_VERSION).toBe("string")
    })
  })

  describe("runProcess", () => {
    test("should execute command with default options", () => {
      const mockExecSync = execSync as unknown as ReturnType<typeof mock>
      mockExecSync.mockClear()

      runProcess("echo", ["hello"])

      expect(mockExecSync).toHaveBeenCalledWith("echo hello", {
        stdio: "inherit",
      })
    })

    test("should execute command with custom options", () => {
      const mockExecSync = execSync as unknown as ReturnType<typeof mock>
      mockExecSync.mockClear()

      const customOptions = { cwd: "/tmp", env: { NODE_ENV: "test" } }
      runProcess("npm", ["install"], customOptions)

      expect(mockExecSync).toHaveBeenCalledWith("npm install", {
        ...customOptions,
        stdio: "inherit",
      })
    })

    test("should handle command with no args", () => {
      const mockExecSync = execSync as unknown as ReturnType<typeof mock>
      mockExecSync.mockClear()

      runProcess("ls")

      expect(mockExecSync).toHaveBeenCalledWith("ls ", { stdio: "inherit" })
    })

    test("should handle multiple args", () => {
      const mockExecSync = execSync as unknown as ReturnType<typeof mock>
      mockExecSync.mockClear()

      runProcess("git", ["add", ".", "--all"])

      expect(mockExecSync).toHaveBeenCalledWith("git add . --all", {
        stdio: "inherit",
      })
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

  describe("isPackageInstalled", () => {
    test("should return true when package is in dependencies", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
          lodash: "^4.17.21",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageInstalled("react", testDir)
      expect(result).toBe(true)
    })

    test("should return true when package is in devDependencies", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        devDependencies: {
          typescript: "^5.0.0",
          "@types/node": "^20.0.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageInstalled("typescript", testDir)
      expect(result).toBe(true)
    })

    test("should return false when package is not installed", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageInstalled("vue", testDir)
      expect(result).toBe(false)
    })

    test("should return false when package.json does not exist", async () => {
      const result = await isPackageInstalled("react", testDir)
      expect(result).toBe(false)
    })

    test("should use current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageInstalled("react")
      expect(result).toBe(true)
    })
  })

  describe("getInstalledPackageVersion", () => {
    test("should return version from dependencies", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
          lodash: "^4.17.21",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await getInstalledPackageVersion("react", testDir)
      expect(result).toBe("^18.2.0")
    })

    test("should return version from devDependencies", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        devDependencies: {
          typescript: "^5.1.6",
          "@types/node": "^20.4.5",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await getInstalledPackageVersion("typescript", testDir)
      expect(result).toBe("^5.1.6")
    })

    test("should prefer dependencies over devDependencies", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          typescript: "^5.0.0",
        },
        devDependencies: {
          typescript: "^4.9.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await getInstalledPackageVersion("typescript", testDir)
      expect(result).toBe("^5.0.0")
    })

    test("should return null when package is not installed", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.0.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await getInstalledPackageVersion("vue", testDir)
      expect(result).toBe(null)
    })

    test("should return null when package.json does not exist", async () => {
      const result = await getInstalledPackageVersion("react", testDir)
      expect(result).toBe(null)
    })

    test("should use current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await getInstalledPackageVersion("react")
      expect(result).toBe("^18.2.0")
    })
  })

  describe("isPackageVersionCorrect", () => {
    test("should return true when versions match exactly", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageVersionCorrect("react", "^18.2.0", testDir)
      expect(result).toBe(true)
    })

    test("should return false when versions don't match", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageVersionCorrect("react", "^17.0.0", testDir)
      expect(result).toBe(false)
    })

    test("should return false when package is not installed", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageVersionCorrect("vue", "^3.0.0", testDir)
      expect(result).toBe(false)
    })

    test("should check devDependencies as well", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        devDependencies: {
          typescript: "^5.1.6",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageVersionCorrect(
        "typescript",
        "^5.1.6",
        testDir
      )
      expect(result).toBe(true)
    })

    test("should use current working directory by default", async () => {
      const packageJson: PackageJson = {
        name: "test-package",
        version: "1.0.0",
        dependencies: {
          react: "^18.2.0",
        },
      }

      await Bun.write(
        join(testDir, "package.json"),
        JSON.stringify(packageJson, null, 2)
      )

      const result = await isPackageVersionCorrect("react", "^18.2.0")
      expect(result).toBe(true)
    })
  })
})
