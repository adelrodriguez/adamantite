import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import fixCommand from "#commands/fix.ts"
import { createRunnerTestContext, runCommandWithRunner } from "./command-test-helpers.ts"

describe("fix", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-fix-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("default invocation", () => {
    test("always include the fix flag", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(fixCommand, [], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: ["--fix"],
          command: "oxlint",
        },
      ])
    })
  })

  describe("fix mode flags", () => {
    test("add suggested fixes when requested", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(fixCommand, ["--suggested"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-suggestions"])
    })

    test("add dangerous fixes when requested", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(fixCommand, ["--dangerous"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-dangerously"])
    })

    test("add all fix modes when all is requested", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(fixCommand, ["--all"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([
        "--fix",
        "--fix-suggestions",
        "--fix-dangerously",
      ])
    })
  })

  describe("file arguments", () => {
    test("deduplicate duplicate file arguments", async () => {
      await writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(fixCommand, ["index.ts", "index.ts"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([
        "--fix",
        realpathSync(join(tempDir, "index.ts")),
      ])
    })
  })

  describe("passthrough arguments", () => {
    test("append arguments after managed fix flags", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(fixCommand, ["--dangerous"], runner, [
        "--deny-warnings",
      ])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-dangerously", "--deny-warnings"])
    })
  })

  describe("error handling", () => {
    test("fail with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])

      const exit = await runCommandWithRunner(fixCommand, [], runner)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("CommandFailed")
    })
  })
})
