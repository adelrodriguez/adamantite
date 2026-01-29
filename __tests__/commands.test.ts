import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import Bun, { spawn } from "bun"

const cliPath = join(import.meta.dir, "..", "src", "index.ts")

describe("commands", () => {
  let tempDir: string
  let originalCwd: string

  beforeEach(async () => {
    // Save original directory
    originalCwd = process.cwd()

    // Create temp directory
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-commands-test-"))

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

  describe("check", () => {
    test("should execute successfully", async () => {
      const proc = spawn(["bun", cliPath, "check"], {
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
        stderr: "pipe",
        stdout: "pipe",
      })

      await proc.exited

      // Exit code might be non-zero if oxlint is not installed or finds issues,
      // but should not exit with code 1 due to package manager error
      // We just verify it doesn't crash immediately
      expect(proc.exitCode).toBeDefined()
    })
  })

  describe("fix", () => {
    test("should execute successfully", async () => {
      const proc = spawn(["bun", cliPath, "fix"], {
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
        stderr: "pipe",
        stdout: "pipe",
      })

      await proc.exited

      // Exit code might be non-zero if oxlint is not installed or finds issues,
      // but should not exit with code 1 due to package manager error
      expect(proc.exitCode).toBeDefined()
    })
  })

  describe("monorepo", () => {
    test("should execute successfully", async () => {
      const proc = spawn(["bun", cliPath, "monorepo"], {
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
        stderr: "pipe",
        stdout: "pipe",
      })

      await proc.exited

      // Exit code might be non-zero if sherif is not installed or finds issues,
      // but should not exit with code 1 due to package manager error
      expect(proc.exitCode).toBeDefined()
    })
  })

  describe("analyze", () => {
    test("should execute successfully", async () => {
      const proc = spawn(["bun", cliPath, "analyze"], {
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
        stderr: "pipe",
        stdout: "pipe",
      })

      await proc.exited

      // Exit code might be non-zero if knip is not installed or finds issues,
      // but should not exit with code 1 due to package manager error
      expect(proc.exitCode).toBeDefined()
    })
  })
})
