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
