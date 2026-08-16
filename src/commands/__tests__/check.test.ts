import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, test } from "@effect/vitest"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { writeFile } from "#__tests__/filesystem.ts"
import checkCommand from "#commands/check.ts"
import { createRunnerTestContext, runCommandWithRunner } from "./command-test-helpers.ts"

describe("check", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-check-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("default invocation", () => {
    test("run oxlint with config-driven linting and type checking by default", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(checkCommand, [], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "oxlint",
        },
      ])
    })
  })

  describe("file arguments", () => {
    test("append file arguments", async () => {
      await writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(checkCommand, ["index.ts"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [realpathSync(join(tempDir, "index.ts"))],
          command: "oxlint",
        },
      ])
    })
  })

  describe("passthrough arguments", () => {
    test("append arguments after file arguments", async () => {
      await writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(checkCommand, ["index.ts"], runner, [
        "--deny-warnings",
      ])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([
        realpathSync(join(tempDir, "index.ts")),
        "--deny-warnings",
      ])
    })
  })

  describe("error handling", () => {
    test("fail with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([2])

      const exit = await runCommandWithRunner(checkCommand, [], runner)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit))
      expect(error).toMatchObject({ _tag: "CommandFailed" })
    })
  })
})
