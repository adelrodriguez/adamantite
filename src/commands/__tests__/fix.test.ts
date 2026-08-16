import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import fixCommand from "#commands/fix.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

describe("fix", () => {
  describe("default invocation", () => {
    it.effect("always include the fix flag", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

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

        const exit = yield* runCommand(fixCommand, ["--suggested"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-suggestions"])
      })
    )

    it.effect("add dangerous fixes when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--dangerous"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", "--fix-dangerously"])
      })
    )

    it.effect("add all fix modes when all is requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--all"], { layers: [runner.layer] })

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
        const files = createFileSystemTestContext({
          files: { "index.ts": "export const value = 1\n" },
        })
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["index.ts", "index.ts"], {
          files,
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--fix", join(files.root, "index.ts")])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after managed fix flags", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--dangerous"], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer],
        })

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

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
