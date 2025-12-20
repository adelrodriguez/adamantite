import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import Bun from "bun"
import { mkdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import { checkIfExists, getTitle, mergeConfig, parseJson, readPackageJson } from "#utils.ts"

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
      expect(result._unsafeUnwrap()).toEqual({ name: "test", version: "1.0.0" })
    })

    test("should parse valid JSONC with comments", () => {
      const jsonc = `{
        // This is a comment
        "name": "test",
        "version": "1.0.0"
      }`
      const result = parseJson(jsonc)

      expect(result.isOk()).toBe(true)
      expect(result._unsafeUnwrap()).toEqual({ name: "test", version: "1.0.0" })
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

  describe("mergeConfig", () => {
    test("should merge two objects", () => {
      const base = { a: 1, b: 2 }
      const override = { b: 3, c: 4 }
      const result = mergeConfig(base, override)

      expect(result.isOk()).toBe(true)
      // defu merges left-to-right, so base (first arg) wins for 'b'
      expect(result._unsafeUnwrap()).toEqual({ a: 1, b: 2, c: 4 })
    })

    test("should give priority to first argument (defu behavior)", () => {
      const first = { a: 1, b: 2 }
      const second = { a: 3, b: 4 }
      const result = mergeConfig(first, second)

      expect(result.isOk()).toBe(true)
      // defu merges left-to-right, so first argument wins
      expect(result._unsafeUnwrap()).toEqual({ a: 1, b: 2 })
    })

    test("should handle nested objects", () => {
      const base = { a: { x: 1, y: 2 }, b: 3 }
      const override = { a: { y: 4, z: 5 }, b: 6 }
      const result = mergeConfig(base, override)

      expect(result.isOk()).toBe(true)
      // defu merges left-to-right, so base values win
      expect(result._unsafeUnwrap()).toEqual({ a: { x: 1, y: 2, z: 5 }, b: 3 })
    })
  })

  describe("getTitle", () => {
    let originalColumns: number | undefined

    beforeEach(() => {
      originalColumns = process.stdout.columns
    })

    afterEach(() => {
      if (originalColumns !== undefined) {
        process.stdout.columns = originalColumns
      } else {
        ;(process.stdout as { columns?: number }).columns = undefined
      }
    })

    test("should return large ASCII art for wide terminals", () => {
      process.stdout.columns = 150
      const result = getTitle()

      expect(result).toContain("█████")
      expect(result).not.toContain(
        "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓"
      )
    })

    test("should return simple box for narrow terminals", () => {
      process.stdout.columns = 80
      const result = getTitle()

      expect(result).toContain(
        "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓"
      )
      expect(result).toContain("ADAMANTITE")
      expect(result).not.toContain("█████")
    })

    test("should return simple box when columns is undefined", () => {
      ;(process.stdout as { columns?: number }).columns = undefined
      const result = getTitle()

      expect(result).toContain(
        "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓"
      )
      expect(result).toContain("ADAMANTITE")
    })

    test("should return large ASCII art for exactly 120 columns", () => {
      process.stdout.columns = 120
      const result = getTitle()

      // At exactly 120, should use large art (>= 120)
      expect(result).toContain("█████")
      expect(result).not.toContain(
        "┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓"
      )
    })
  })
})
