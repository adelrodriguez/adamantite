import * as NodeServices from "@effect/platform-node/NodeServices"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import { runCli } from "#cli.ts"
import {
  createRunnerTestContext,
  type RunnerTestContext,
} from "#commands/__tests__/command-test-helpers.ts"
import { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"
import { TerminalCapabilities } from "#terminal/capabilities.ts"
import { Prompter } from "#terminal/prompter.ts"

function runCliWithRunner(args: readonly string[], runner: RunnerTestContext) {
  return runCli(args, "test").pipe(
    Effect.provide(
      Layer.mergeAll(
        NodeServices.layer,
        NodeVersionResolver.layer.pipe(Layer.provide(NodeServices.layer)),
        Prompter.layer,
        runner.layer,
        DependencyInstaller.layer,
        TerminalCapabilities.layer
      )
    ),
    Effect.exit
  )
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
