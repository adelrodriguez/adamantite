import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import formatCommand from "#commands/format.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

describe("format", () => {
  describe("default invocation", () => {
    it.effect("run oxfmt with no flags by default", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(formatCommand, [], { layers: [runner.layer] })

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

        const exit = yield* runCommand(formatCommand, ["--check"], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--check"])
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

        const exit = yield* runCommand(formatCommand, ["index.ts"], {
          files,
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual([join(files.root, "index.ts")])
      })
    )
  })

  describe("passthrough arguments", () => {
    it.effect("append arguments after managed formatter arguments", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(formatCommand, ["--check"], {
          forwardedArguments: ["--ignore-path", ".formatignore"],
          layers: [runner.layer],
        })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations[0]?.args).toEqual(["--check", "--ignore-path", ".formatignore"])
      })
    )
  })

  describe("error handling", () => {
    it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([1])

        const exit = yield* runCommand(formatCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
