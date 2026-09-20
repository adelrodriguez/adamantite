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
    it.effect("lint before formatting", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--fix"],
            command: "oxlint",
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write"],
            command: "oxfmt",
            title: "✨ Formatting",
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

  describe("stage flags", () => {
    it.effect("run only the lint stage when selected", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "lint", "--suggested"], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--fix", "--fix-suggestions", "--deny-warnings"],
            command: "oxlint",
            title: "🔧 Fixing lint issues",
          },
        ])
      })
    )

    it.effect("run only the format stage when selected and forward arguments to it", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "format"], {
          forwardedArguments: ["--no-error-on-unmatched-pattern"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--write", "--no-error-on-unmatched-pattern"],
            command: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )

    it.effect("reject lint fix modes with the format stage", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(fixCommand, ["--only", "format", "--all"], {
          layers: [runner.layer],
        })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "InvalidFixOptions" })
        expect(runner.invocations).toEqual([])
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
        expect(runner.invocations).toEqual([
          {
            args: ["--fix", join(files.root, "index.ts")],
            command: "oxlint",
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write", join(files.root, "index.ts")],
            command: "oxfmt",
            title: "✨ Formatting",
          },
        ])
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
        expect(runner.invocations).toEqual([
          {
            args: ["--fix", "--fix-dangerously", "--deny-warnings"],
            command: "oxlint",
            title: "🔧 Fixing lint issues",
          },
          {
            args: ["--write"],
            command: "oxfmt",
            title: "✨ Formatting",
          },
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("run formatting after linting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1, 2])

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed", command: "oxlint", exitCode: 1 })
        expect(runner.invocations).toHaveLength(2)
      })
    )

    it.effect("report a formatting failure after linting succeeds", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([0, 2])

        const exit = yield* runCommand(fixCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed", command: "oxfmt", exitCode: 2 })
      })
    )
  })
})
