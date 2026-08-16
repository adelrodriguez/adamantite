import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { writeFile } from "#__tests__/filesystem.ts"
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
    it.effect("run oxfmt with no flags by default", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(formatCommand, [], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: [],
            command: "oxfmt",
          },
        ])
      })
    )
  })

  describe("check mode", () => {
    it.effect("add the check flag when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(formatCommand, ["--check"], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--check"])
      })
    )
  })

  describe("file arguments", () => {
    it.effect("append file arguments", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
        )
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(formatCommand, ["index.ts"], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([realpathSync(join(tempDir, "index.ts"))])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after managed formatter arguments", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(formatCommand, ["--check"], runner, [
          "--ignore-path",
          ".formatignore",
        ])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--check", "--ignore-path", ".formatignore"])
      })
    )
  })

  describe("error handling", () => {
    it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommandWithRunner(formatCommand, [], runner)

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
