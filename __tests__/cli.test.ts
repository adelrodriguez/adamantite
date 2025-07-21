import { describe, expect, test } from "bun:test"
import Bun, { spawn } from "bun"
import { join } from "node:path"

describe("CLI", () => {
  describe("version", () => {
    test("displays correct version with --version flag", async () => {
      const cliPath = join(import.meta.dir, "..", "cli", "index.ts")

      const proc = spawn(["bun", cliPath, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      // Read package.json to get expected version
      const packageJson = await Bun.file("package.json").json()
      expect(output.trim()).toBe(packageJson.version)

      expect(proc.exitCode).toBe(0)
    })
  })
})
