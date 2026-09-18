import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import { makeAppLayer, runCli } from "#cli.ts"
import {
  createRunnerTestContext,
  type RunnerTestContext,
} from "#commands/__tests__/command-test-helpers.ts"

function runCliWithRunner(args: readonly string[], runner: RunnerTestContext) {
  return runCli(args, "test").pipe(Effect.provide(makeAppLayer(runner.layer)), Effect.exit)
}

describe("adamantite", () => {
  it.effect.each(["format", "monorepo"])("reject the removed %s command", (command) =>
    Effect.gen(function* () {
      const runner = createRunnerTestContext()
      const exit = yield* runCliWithRunner([command], runner)

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit))
      expect(error._tag).toBe("ShowHelp")
      expect(runner.invocations).toEqual([])
    })
  )

  it.effect.each(["format", "check:monorepo", "fix:monorepo"])(
    "reject the removed %s init script",
    (script) =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()
        const exit = yield* runCliWithRunner(
          ["init", "--non-interactive", "--script", script],
          runner
        )

        expect(Exit.isFailure(exit)).toBe(true)
        expect(Option.getOrThrow(Exit.findErrorOption(exit))._tag).toBe("ShowHelp")
        expect(runner.invocations).toEqual([])
      })
  )

  describe("passthrough arguments", () => {
    it.effect("forward every argument after the first separator to the selected command", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCliWithRunner(
          ["analyze", "--strict", "--", "--directory", "packages/app", "--", "--include", "src"],
          runner
        )

        expect(Exit.isSuccess(exit)).toBe(true)
        expect(runner.invocations).toEqual([
          {
            args: [
              "--production",
              "--strict",
              "--directory",
              "packages/app",
              "--",
              "--include",
              "src",
            ],
            command: "knip",
            stdin: "ignore",
            title: "🧹 Analyzing unused code",
          },
        ])
      })
    )

    it.effect("reject passthrough arguments for commands that do not proxy a CLI", () =>
      Effect.gen(function* () {
        const runner = createRunnerTestContext()

        const exit = yield* runCliWithRunner(["doctor", "--", "--unknown"], runner)

        expect(Exit.isFailure(exit)).toBe(true)
        const error = Option.getOrThrow(Exit.findErrorOption(exit))
        expect(error._tag).toBe("PassthroughNotSupported")
        expect(runner.invocations).toEqual([])
      })
    )
  })
})
