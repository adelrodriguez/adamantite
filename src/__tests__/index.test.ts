import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import Bun, { spawn } from "bun"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { runCli } from "#cli.ts"
import {
  createRunnerTestContext,
  type RunnerTestContext,
} from "#commands/__tests__/command-test-helpers.ts"
import { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import { Prompter } from "#lib/services/prompter.ts"

function runCliWithRunner(args: readonly string[], runner: RunnerTestContext) {
  return Effect.runPromiseExit(
    runCli(args, "test").pipe(
      Effect.provide(
        Layer.mergeAll(NodeServices.layer, Prompter.layer, runner.layer, DependencyInstaller.layer)
      )
    )
  )
}

describe("adamantite", () => {
  const cliPath = join(import.meta.dir, "..", "index.ts")

  describe("--version", () => {
    test("display the package version", async () => {
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
        .replace(/^\[log\]\s*/, "")
        .replace(/^adamantite v/, "")

      expect(version).toBe(packageJson.version ?? "")
      expect(proc.exitCode).toBe(0)
    })
  })

  describe("--help", () => {
    test("print top-level help with key subcommands", async () => {
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
  })

  describe("unknown subcommands", () => {
    test("print an error and exit non-zero", async () => {
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

  describe("passthrough arguments", () => {
    test("forward every argument after the first separator to the selected command", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCliWithRunner(
        ["analyze", "--strict", "--", "--directory", "packages/app", "--", "--include", "src"],
        runner
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [
            "--production",
            "--strict",
            "--directory",
            "packages/app",
            "--",
            "--include",
            "src",
          ],
          command: "knip",
        },
      ])
    })

    test("reject passthrough arguments for commands that do not proxy a CLI", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCliWithRunner(["doctor", "--", "--unknown"], runner)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit))
      expect(error._tag).toBe("PassthroughNotSupported")
      expect(runner.invocations).toEqual([])
    })
  })
})
