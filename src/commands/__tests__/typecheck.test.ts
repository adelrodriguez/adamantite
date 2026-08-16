import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Option from "effect/Option"
import typecheckCommand from "#commands/typecheck.ts"
import {
  createPrompterTestContext,
  createRunnerTestContext,
  runCommand,
} from "./command-test-helpers.ts"

describe("typecheck", () => {
  it.effect("run oxlint with config-driven checks and log deprecation warning", () =>
    Effect.gen(function* () {
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(typecheckCommand, [], {
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(prompter.logs).toContainEqual({
        level: "warning",
        message: "Deprecated. Use `adamantite check` for typechecking.",
      })
      expect(runner.invocations).toEqual([
        {
          args: [],
          command: "oxlint",
        },
      ])
    })
  )

  it.effect("forward arguments to oxlint", () =>
    Effect.gen(function* () {
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext()

      const exit = yield* runCommand(typecheckCommand, [], {
        forwardedArguments: ["--deny-warnings"],
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isSuccess(exit)).toBe(true)
      expect(runner.invocations[0]?.args).toEqual(["--deny-warnings"])
    })
  )

  it.effect("fail with CommandFailed when the runner returns a non-zero exit code", () =>
    Effect.gen(function* () {
      const prompter = createPrompterTestContext()
      const runner = createRunnerTestContext([1])

      const exit = yield* runCommand(typecheckCommand, [], {
        layers: [prompter.layer, runner.layer],
      })

      expect(Exit.isFailure(exit)).toBe(true)
      const error = Option.getOrThrow(Exit.findErrorOption(exit))
      expect(error).toMatchObject({ _tag: "CommandFailed" })
    })
  )
})
