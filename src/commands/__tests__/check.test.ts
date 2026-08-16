import { join } from "node:path"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { createFileSystemTestContext } from "#__tests__/filesystem.ts"
import checkCommand from "#commands/check.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

describe("check", () => {
  describe("default invocation", () => {
    it.effect("run oxlint with config-driven linting and type checking by default", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(checkCommand, [], { layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: [],
            command: "oxlint",
          },
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
            args: [join(files.root, "index.ts")],
            command: "oxlint",
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
        expect(runner.invocations[0]?.args).toEqual([
          join(files.root, "index.ts"),
          "--deny-warnings",
        ])
      })
    )
  })

  describe("error handling", () => {
    it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext([2])

        const exit = yield* runCommand(checkCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
