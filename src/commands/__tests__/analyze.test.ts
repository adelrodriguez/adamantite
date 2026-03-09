import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import analyzeCommand from "#commands/analyze.ts"
import { createRunnerTestContext, runCommandWithRunner } from "./command-test-helpers.ts"

describe("analyze", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-analyze-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("default invocation", () => {
    test("run knip with no flags by default", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(analyzeCommand, [], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "knip",
        },
      ])
    })
  })

  describe("fix mode", () => {
    test("add fix flags when requested", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(analyzeCommand, ["--fix"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--fix", "--allow-remove-files"])
    })
  })

  describe("strict mode", () => {
    test("add strict flags when requested", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(analyzeCommand, ["--strict"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--production", "--strict"])
    })
  })

  describe("combined flags", () => {
    test("support fix and strict together", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(analyzeCommand, ["--fix", "--strict"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([
        "--fix",
        "--allow-remove-files",
        "--production",
        "--strict",
      ])
    })
  })

  describe("error handling", () => {
    test("fail with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])

      const exit = await runCommandWithRunner(analyzeCommand, [], runner)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("CommandFailed")
    })
  })
})
