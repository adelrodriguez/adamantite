import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
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
    it.effect("run sherif by default", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(monorepoCommand, [], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: [],
            command: "sherif",
            stdin: "inherit",
          },
        ])
      })
    )
  })

  describe("fix mode", () => {
    it.effect("add fix when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(monorepoCommand, ["--fix"], runner)

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]).toEqual({
          args: ["--fix"],
          command: "sherif",
          stdin: "inherit",
        })
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after managed Sherif flags", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommandWithRunner(monorepoCommand, ["--fix"], runner, [
          "--ignore-package",
          "package-a",
        ])

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]).toEqual({
          args: ["--fix", "--ignore-package", "package-a"],
          command: "sherif",
          stdin: "inherit",
        })
      })
    )
  })

  describe("error handling", () => {
    it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommandWithRunner(monorepoCommand, [], runner)

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
