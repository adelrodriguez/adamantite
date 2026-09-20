import { join } from "node:path"
import { stripVTControlCharacters } from "node:util"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import checkCommand from "#commands/check.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

describe("check", () => {
  describe("default invocation", () => {
    it.effect("check formatting before linting", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--check"],
            command: "oxfmt",
            title: "✨ Checking formatting",
          },
          {
            args: [],
            command: "oxlint",
            title: "🔍 Linting",
          },
        ])
      })
    )
  })

  describe("stage flags", () => {
    it.effect("run only linting when lint is requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--lint"], {
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--deny-warnings"],
            command: "oxlint",
            title: "🔍 Linting",
          },
        ])
      })
    )

    it.effect(
      "run only the format check when format is requested and forward arguments to it",
      () =>
        Effect.gen(function* () {
          const runner = createRunnerTestContext()

          const exit = yield* runCommand(checkCommand, ["--format"], {
            forwardedArguments: ["--no-error-on-unmatched-pattern"],
            layers: [runner.layer],
          })

          expect(Exit.isSuccess(exit)).toBe(true)
          expect(runner.invocations).toEqual([
            {
              args: ["--check", "--no-error-on-unmatched-pattern"],
              command: "oxfmt",
              title: "✨ Checking formatting",
            },
          ])
        })
    )

    it.effect("run both stages when lint and format are both requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["--lint", "--format"], {
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations.map((invocation) => invocation.command)).toEqual([
          "oxfmt",
          "oxlint",
        ])
      })
    )
  })

  describe("output", () => {
    it.effect("print a heading before each tool", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()
        const logLines: unknown[] = []

        yield* runCommand(checkCommand, [], { layers: [runner.layer], logLines })

        expect(logLines.map((line) => stripVTControlCharacters(String(line)))).toEqual([
          "✨ Checking formatting · adamantite (oxfmt)",
          "",
          "🔍 Linting · adamantite (oxlint)",
        ])
      })
    )
  })

  describe("file arguments", () => {
    it.effect("append file arguments", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: { "index.ts": "export const value = 1\n" },
        })
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["index.ts"], {
          files,
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--check", join(files.root, "index.ts")],
            command: "oxfmt",
            title: "✨ Checking formatting",
          },
          {
            args: [join(files.root, "index.ts")],
            command: "oxlint",
            title: "🔍 Linting",
          },
        ])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after file arguments", () =>
      Effect.gen(function* () {
        const files = createFileSystemTestContext({
          files: { "index.ts": "export const value = 1\n" },
        })
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, ["index.ts"], {
          files,
          forwardedArguments: ["--deny-warnings"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: ["--check", join(files.root, "index.ts")],
            command: "oxfmt",
            title: "✨ Checking formatting",
          },
          {
            args: [join(files.root, "index.ts"), "--deny-warnings"],
            command: "oxlint",
            title: "🔍 Linting",
          },
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("run lint after formatting fails and report the first failure", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([2, 3])

        const exit = yield* runCommand(checkCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed", command: "oxfmt", exitCode: 2 })
        expect(runner.invocations).toHaveLength(2)
      })
    )
  })
})
