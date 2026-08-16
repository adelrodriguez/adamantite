import { spawn } from "node:child_process"
import { join } from "node:path"
import type { PackageJson } from "type-fest"
import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, test } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { testFile } from "#__tests__/filesystem.ts"
import { runCli } from "#cli.ts"
import {
  createRunnerTestContext,
  type RunnerTestContext,
} from "#commands/__tests__/command-test-helpers.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"
import { Prompter } from "#terminal/prompter.ts"

function runCliWithRunner(args: readonly string[], runner: RunnerTestContext) {
  return Effect.runPromiseExit(
    runCli(args, "test").pipe(
      Effect.provide(
        Layer.mergeAll(
          NodeServices.layer,
          NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer)),
          Prompter.layer,
          runner.layer,
          DependencyInstaller.layer
        )
      )
    )
  )
}

async function runCliProcess(args: string[]) {
  const cliPath = join(import.meta.dirname, "..", "..", "bin", "adamantite")
  const child = spawn(process.execPath, [cliPath, ...args], {
    env: { ...process.env, NODE_ENV: undefined },
    stdio: ["ignore", "pipe", "pipe"],
  })
  let stderr = ""
  let stdout = ""

  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk
  })
  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk
  })

  const exitCode = await new Promise<number | null>((resolve, reject) => {
    child.once("error", reject)
    child.once("close", resolve)
  })

  return { exitCode, stderr, stdout }
}

describe("adamantite", () => {
  describe("--version", () => {
    test("display the package version", async () => {
      const result = await runCliProcess(["--version"])

      // SAFETY: package.json is this repo's manifest, which the package manager already requires to conform to the PackageJson schema.
      const packageJson = JSON.parse(await testFile("package.json").text()) as PackageJson
      const version = result.stdout
        .trim()
        .replace(/^\[log\]\s*/, "")
        .replace(/^adamantite v/, "")

      expect(version).toBe(packageJson.version ?? "")
      expect(result.exitCode).toBe(0)
    })
  })

  describe("--help", () => {
    test("print top-level help with key subcommands", async () => {
      const result = await runCliProcess(["--help"])

      expect(result.stdout).toContain("USAGE")
      expect(result.stdout).toContain("adamantite <subcommand> [flags]")
      expect(result.stdout).toContain("check")
      expect(result.stdout).toContain("init")
      expect(result.stdout).toContain("update")
      expect(result.exitCode).toBe(0)
    })

    test("print non-interactive setup flags for init", async () => {
      const result = await runCliProcess(["init", "--help"])

      expect(result.stdout).toContain("adamantite init [flags]")
      expect(result.stdout).toContain("--non-interactive")
      expect(result.stdout).toContain("--script choice")
      expect(result.stdout).toContain("--preset choice")
      expect(result.stdout).toContain("--editor choice")
      expect(result.stdout).toContain("--typescript")
      expect(result.stdout).toContain("--install-extensions")
      expect(result.stdout).toContain("--github-actions")
      expect(result.stdout).toContain("--agents")
      expect(result.stdout).toContain("Setup flags require --non-interactive")
      expect(result.stdout).toContain("omitted boolean setup flags are disabled")
      expect(result.stdout).toContain("requires at least one --script")
      expect(result.stdout).toContain("Monorepo scripts require a detected monorepo")
      expect(result.stdout).toContain("requires --script check or fix")
      expect(result.stdout).toContain("requires at least one --editor")
      expect(result.stdout).toContain("requires a compatible script")
      expect(result.stdout).toContain("bun, deno, npm, pnpm, or yarn")
      expect(result.stdout).toContain("EXAMPLES")
      expect(result.stdout).toContain("adamantite init --non-interactive --script check")
      expect(result.exitCode).toBe(0)
    })
  })

  describe("unknown subcommands", () => {
    test("print an error and exit non-zero", async () => {
      const result = await runCliProcess(["nope"])

      expect(result.stdout).toContain("Help requested")
      expect(result.stderr).toContain('Unknown subcommand "nope"')
      expect(result.exitCode).toBe(1)
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
