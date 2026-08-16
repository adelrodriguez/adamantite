import { mkdtempSync, realpathSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { writeFile } from "#__tests__/filesystem.ts"
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
    it.effect("always include the fix flag", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(fixCommand, [], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--fix"],
            command: "oxlint",
          },
        ])
      })
    )
  })

  describe("fix mode flags", () => {
    it.effect("add suggested fixes when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(fixCommand, ["--suggested"], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-suggestions"])
      })
    )

    it.effect("add dangerous fixes when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(fixCommand, ["--dangerous"], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-dangerously"])
      })
    )

    it.effect("add all fix modes when all is requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(fixCommand, ["--all"], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--fix",
          "--fix-suggestions",
          "--fix-dangerously",
        ])
      })
    )
  })

  describe("file arguments", () => {
    it.effect("deduplicate duplicate file arguments", () =>
      Effect.gen(function* () {
        yield* Effect.promise(() =>
          writeFile(join(tempDir, "index.ts"), "export const value = 1\n")
        )
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(fixCommand, ["index.ts", "index.ts"], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--fix",
          realpathSync(join(tempDir, "index.ts")),
        ])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after managed fix flags", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(fixCommand, ["--dangerous"], runner, [
          "--deny-warnings",
        ])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--fix",
          "--fix-dangerously",
          "--deny-warnings",
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommandWithRunner(fixCommand, [], runner)

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
