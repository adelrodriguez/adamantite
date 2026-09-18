import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import monorepoCommand from "#commands/monorepo.ts"
import { createRunnerTestContext, runCommand } from "./command-test-helpers.ts"

describe("monorepo", () => {
  describe("default invocation", () => {
    it.effect("run sherif by default", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(monorepoCommand, [], { layers: [runner.layer] })

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

  describe("deprecation", () => {
    it.effect("print a deprecation warning on stderr and still run sherif", () =>
      Effect.gen(function* () {
        const errorLines: unknown[] = []
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(monorepoCommand, [], { errorLines, layers: [runner.layer] })

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toHaveLength(1)
        expect(errorLines).toEqual([
          "Warning: `adamantite monorepo` is deprecated and will be removed in the next release. Use `adamantite analyze --only monorepo` instead.",
        ])
      })
    )

    it.effect("print the exact replacement for the invocation", () =>
      Effect.gen(function* () {
        const errorLines: unknown[] = []
        const runner = createRunnerTestContext()

        yield* runCommand(monorepoCommand, ["--fix"], {
          errorLines,
          forwardedArguments: ["--select", "highest"],
          layers: [runner.layer],
        })

        expect(errorLines).toHaveLength(1)
        expect(errorLines[0]).toContain(
          "Use `adamantite analyze --only monorepo --fix -- --select highest` instead."
        )
      })
    )
  })

  describe("fix mode", () => {
    it.effect("add fix when requested", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCommand(monorepoCommand, ["--fix"], { layers: [runner.layer] })

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

        const exit = yield* runCommand(monorepoCommand, ["--fix"], {
          forwardedArguments: ["--ignore-package", "package-a"],
          layers: [runner.layer],
        })

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

        const exit = yield* runCommand(monorepoCommand, [], { layers: [runner.layer] })

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error).toMatchObject({ _tag: "CommandFailed" })
      })
    )
  })
})
