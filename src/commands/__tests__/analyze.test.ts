import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import analyzeCommand from "#commands/analyze.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

describe("analyze", () => {
  describe("default invocation", () => {
    it.effect("run knip with no flags by default", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: [],
            command: "knip",
          },
        ])
      })
    )
  })

  describe("fix mode", () => {
    it.effect("add fix flags when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--fix"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--allow-remove-files"])
      })
    )
  })

  describe("strict mode", () => {
    it.effect("add strict flags when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--strict"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--production", "--strict"])
      })
    )
  })

  describe("combined flags", () => {
    it.effect("support fix and strict together", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--fix", "--strict"], {
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--fix",
          "--allow-remove-files",
          "--production",
          "--strict",
        ])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after Adamantite-managed flags", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(analyzeCommand, ["--strict"], {
          forwardedArguments: ["--directory", "packages/app"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([
          "--production",
          "--strict",
          "--directory",
          "packages/app",
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommand(analyzeCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
