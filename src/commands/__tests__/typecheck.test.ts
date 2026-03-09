import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import typecheckCommand from "#commands/typecheck.ts"
import { createRunnerTestContext, runCommandWithRunner } from "./command-test-helpers.ts"

describe("typecheck", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-typecheck-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("default invocation", () => {
    test("run tsc with noEmit in the current working directory", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(typecheckCommand, [], runner, tempDir)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: ["--noEmit"],
          command: "tsc",
          cwd: realpathSync(tempDir),
        },
      ])
    })
  })

  describe("project and watch options", () => {
    test("add project and watch options when requested", async () => {
      await writeFile(join(tempDir, "tsconfig.test.json"), '{"compilerOptions":{"noEmit":true}}\n')
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(
        typecheckCommand,
        ["--project", "tsconfig.test.json", "--watch"],
        runner,
        tempDir
      )

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]).toEqual({
        args: [
          "--noEmit",
          "--project",
          realpathSync(join(tempDir, "tsconfig.test.json")),
          "--watch",
        ],
        command: "tsc",
        cwd: realpathSync(tempDir),
      })
    })
  })

  describe("error handling", () => {
    test("fail with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])

      const exit = await runCommandWithRunner(typecheckCommand, [], runner, tempDir)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("CommandFailed")
    })
  })
})
