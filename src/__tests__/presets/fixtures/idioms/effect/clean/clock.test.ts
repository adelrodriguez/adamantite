import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect"
import { TestClock } from "effect/testing"

describe("clock", () => {
  it.effect("completes sleeping work", () =>
    Effect.gen(function* () {
      const fiber = yield* Effect.forkChild(Effect.sleep(1000).pipe(Effect.as("done")))
      yield* TestClock.adjust(1000)
      const value = yield* Fiber.join(fiber)
      expect(value).toBe("done")
    })
  )
})
