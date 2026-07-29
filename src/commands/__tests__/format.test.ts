import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import formatCommand from "#commands/format.ts"
import { createRunnerTestContext, runCommandWithRunner } from "./command-test-helpers.ts"

describe("format", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-format-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("default invocation", () => {
    test("run oxfmt with no flags by default", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(formatCommand, [], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "oxfmt",
        },
      ])
    })
  })

  describe("check mode", () => {
    test("add the check flag when requested", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(formatCommand, ["--check"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--check"])
    })
  })

  describe("file arguments", () => {
    test("append file arguments", async () => {
      await writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(formatCommand, ["index.ts"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual([realpathSync(join(tempDir, "index.ts"))])
    })
  })

  describe("passthrough arguments", () => {
    test("append arguments after managed formatter arguments", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(formatCommand, ["--check"], runner, [
        "--ignore-path",
        ".formatignore",
      ])

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--check", "--ignore-path", ".formatignore"])
    })
  })

  describe("error handling", () => {
    test("fail with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])

      const exit = await runCommandWithRunner(formatCommand, [], runner)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("CommandFailed")
    })
  })
})
