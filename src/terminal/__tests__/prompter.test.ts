import type { SpinnerResult } from "@clack/prompts"
import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Function from "effect/Function"
import { Prompter } from "#terminal/prompter.ts"

function createSpinner() {
  const messages: string[] = []
  const starts: Array<string | undefined> = []
  const stops: Array<string | undefined> = []
  const spinner: SpinnerResult = {
    cancel: Function.constVoid,
    clear: Function.constVoid,
    error: Function.constVoid,
    get isCancelled() {
      return false
    },
    message(message) {
      if (message !== undefined) {
        messages.push(message)
      }
    },
    start(message) {
      starts.push(message)
    },
    stop(message) {
      stops.push(message)
    },
  }

  return { messages, spinner, starts, stops }
}

function runWithPrompter<A, E>(effect: Effect.Effect<A, E, Prompter>, spinner: SpinnerResult) {
  return effect.pipe(Effect.provide(Prompter.layerWithSpinner(() => spinner)), Effect.exit)
}

describe("Prompter.withSpinner", () => {
  it.effect("manage the spinner around a successful effect", () =>
    Effect.gen(function* () {
      const { messages, spinner, starts, stops } = createSpinner()
      const exit = yield* runWithPrompter(
        Effect.gen(function* () {
          const prompter = yield* Prompter
          return yield* prompter.withSpinner(
            (control) =>
              Effect.gen(function* () {
                yield* control.message("Still working...")
                return 42
              }),
            {
              failure: "Operation failed.",
              start: "Starting operation...",
              success: (result) => `Operation returned ${result}.`,
            }
          )
        }),
        spinner
      )

      expect(exit).toEqual(Exit.succeed(42))
      expect(starts).toEqual(["Starting operation..."])
      expect(messages).toEqual(["Still working..."])
      expect(stops).toEqual(["Operation returned 42."])
    })
  )

  it.effect("stop the spinner when the effect fails", () =>
    Effect.gen(function* () {
      const { spinner, stops } = createSpinner()
      const exit = yield* runWithPrompter(
        Effect.gen(function* () {
          const prompter = yield* Prompter
          return yield* prompter.withSpinner(() => Effect.fail("failed"), {
            failure: "Operation failed.",
            start: "Starting operation...",
            success: "Operation succeeded.",
          })
        }),
        spinner
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(stops).toEqual(["Operation failed."])
    })
  )

  it.effect("stop the spinner when the effect is interrupted", () =>
    Effect.gen(function* () {
      const { spinner, stops } = createSpinner()
      const exit = yield* runWithPrompter(
        Effect.gen(function* () {
          const prompter = yield* Prompter
          return yield* prompter.withSpinner(() => Effect.interrupt, {
            failure: "Operation interrupted.",
            start: "Starting operation...",
            success: "Operation succeeded.",
          })
        }),
        spinner
      )

      expect(Exit.isFailure(exit)).toBe(true)
      expect(stops).toEqual(["Operation interrupted."])
    })
  )
})
