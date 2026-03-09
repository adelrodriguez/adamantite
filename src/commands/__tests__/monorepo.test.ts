import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import monorepoCommand from "#commands/monorepo.ts"
import { createRunnerTestContext, runCommandWithRunner } from "./command-test-helpers.ts"

describe("monorepo", () => {
  let originalCwd: string
  let tempDir: string

  beforeEach(() => {
    originalCwd = process.cwd()
    tempDir = mkdtempSync(join(tmpdir(), "adamantite-monorepo-test-"))
    process.chdir(tempDir)
  })

  afterEach(() => {
    process.chdir(originalCwd)
    rmSync(tempDir, { force: true, recursive: true })
  })

  describe("default invocation", () => {
    test("run sherif by default", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(monorepoCommand, [], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "sherif",
          stdin: "inherit",
        },
      ])
    })
  })

  describe("fix mode", () => {
    test("add fix when requested", async () => {
      const runner = createRunnerTestContext()

      const exit = await runCommandWithRunner(monorepoCommand, ["--fix"], runner)

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]).toEqual({
        args: ["--fix"],
        command: "sherif",
        stdin: "inherit",
      })
    })
  })

  describe("error handling", () => {
    test("fail with CommandFailed when the runner returns a non-zero exit code", async () => {
      const runner = createRunnerTestContext([1])

      const exit = await runCommandWithRunner(monorepoCommand, [], runner)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit)) as { _tag: string }
      expect(error._tag).toBe("CommandFailed")
    })
  })
})
