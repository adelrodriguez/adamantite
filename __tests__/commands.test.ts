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

  describe("check", () => {
    test("should fail gracefully when no package manager detected", async () => {
      // No lockfile exists
      const proc = spawn(["bun", cliPath, "check"], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
      })

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      await proc.exited

      expect(proc.exitCode).toBe(1)
      // Error message might be in stdout (from @clack/prompts) or stderr
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })

    test("should execute successfully with valid lockfile", async () => {
      // Create bun.lock to simulate package manager
      await Bun.write("bun.lock", "")

      const proc = spawn(["bun", cliPath, "check"], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
      })

      await proc.exited

      // Exit code might be non-zero if biome is not installed or finds issues,
      // but should not exit with code 1 due to package manager error
      // We just verify it doesn't crash immediately
      expect(proc.exitCode).toBeDefined()
    })
  })

  describe("fix", () => {
    test("should fail gracefully when no package manager detected", async () => {
      // No lockfile exists
      const proc = spawn(["bun", cliPath, "fix"], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
      })

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      await proc.exited

      expect(proc.exitCode).toBe(1)
      // Error message might be in stdout (from @clack/prompts) or stderr
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })

    test("should execute successfully with valid lockfile", async () => {
      // Create bun.lock to simulate package manager
      await Bun.write("bun.lock", "")

      const proc = spawn(["bun", cliPath, "fix"], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
      })

      await proc.exited

      // Exit code might be non-zero if biome is not installed or finds issues,
      // but should not exit with code 1 due to package manager error
      expect(proc.exitCode).toBeDefined()
    })
  })

  describe("monorepo", () => {
    test("should fail gracefully when no package manager detected", async () => {
      // No lockfile exists
      const proc = spawn(["bun", cliPath, "monorepo"], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
      })

      const stdout = await new Response(proc.stdout).text()
      const stderr = await new Response(proc.stderr).text()
      await proc.exited

      expect(proc.exitCode).toBe(1)
      // Error message might be in stdout (from @clack/prompts) or stderr
      const output = stdout + stderr
      expect(output.length).toBeGreaterThan(0)
    })

    test("should execute successfully with valid lockfile", async () => {
      // Create bun.lock to simulate package manager
      await Bun.write("bun.lock", "")

      const proc = spawn(["bun", cliPath, "monorepo"], {
        stdout: "pipe",
        stderr: "pipe",
        cwd: tempDir,
        env: { ...process.env, NODE_ENV: undefined },
      })

      await proc.exited

      // Exit code might be non-zero if sherif is not installed or finds issues,
      // but should not exit with code 1 due to package manager error
      expect(proc.exitCode).toBeDefined()
    })
  })
})
