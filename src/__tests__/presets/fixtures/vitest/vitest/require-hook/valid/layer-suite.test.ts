import { expect, layer } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"

const TestLayer = Layer.empty

layer(TestLayer)("clock", (it) => {
  it.effect("give a value", () =>
    Effect.gen(function* () {
      const value = yield* Effect.succeed(1)

      expect(value).toBe(1)
    })
  )
})
