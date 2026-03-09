import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import Bun, { spawn } from "bun"

const LOG_PREFIX_REGEX = /^\[log\]\s*/

describe("CLI", () => {
  const cliPath = join(import.meta.dir, "..", "src", "index.ts")

  test("displays the package version with --version", async () => {
    const proc = spawn(["bun", cliPath, "--version"], {
      env: { ...process.env, NODE_ENV: undefined },
      stderr: "pipe",
      stdout: "pipe",
    })

    const output = await new Response(proc.stdout).text()
    await proc.exited

    const packageJson = (await Bun.file("package.json").json()) as PackageJson
    const version = output
      .trim()
      .replace(LOG_PREFIX_REGEX, "")
      .replace(/^adamantite v/, "")

    expect(version).toBe(packageJson.version ?? "")
    expect(proc.exitCode).toBe(0)
  })

  test("prints top-level help with key subcommands", async () => {
    const proc = spawn(["bun", cliPath, "--help"], {
      env: { ...process.env, NODE_ENV: undefined },
      stderr: "pipe",
      stdout: "pipe",
    })

    const output = await new Response(proc.stdout).text()
    await proc.exited

    expect(output).toContain("USAGE")
    expect(output).toContain("adamantite <subcommand> [flags]")
    expect(output).toContain("check")
    expect(output).toContain("init")
    expect(output).toContain("update")
    expect(proc.exitCode).toBe(0)
  })

  test("prints an error and exits non-zero for an unknown command", async () => {
    const proc = spawn(["bun", cliPath, "nope"], {
      env: { ...process.env, NODE_ENV: undefined },
      stderr: "pipe",
      stdout: "pipe",
    })

    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    await proc.exited

    expect(stdout).toContain("Help requested")
    expect(stderr).toContain('Unknown subcommand "nope"')
    expect(proc.exitCode).toBe(1)
  })
})
