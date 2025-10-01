import { describe, expect, test } from "bun:test"
import Bun, { spawn } from "bun"
import { join } from "node:path"

const LOG_PREFIX_REGEX = /^\[log\]\s*/

describe("CLI", () => {
  describe("version", () => {
    test("displays correct version with --version flag", async () => {
      const cliPath = join(import.meta.dir, "..", "src", "index.ts")

      const proc = spawn(["bun", cliPath, "--version"], {
        stdout: "pipe",
        stderr: "pipe",
        env: { ...process.env, NODE_ENV: undefined },
      })

      const output = await new Response(proc.stdout).text()
      await proc.exited

      // Read package.json to get expected version
      const packageJson = await Bun.file("package.json").json()
      // Strip citty's [log] prefix if present (added by consola in CI environments)
      const version = output.trim().replace(LOG_PREFIX_REGEX, "")
      expect(version).toBe(packageJson.version)

      expect(proc.exitCode).toBe(0)
    })
  })
})
