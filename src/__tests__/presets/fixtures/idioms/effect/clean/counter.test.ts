import { expect, layer } from "@effect/vitest"
import { Context, Effect, Layer, Ref } from "effect"

class Counter extends Context.Service<Counter, Ref.Ref<number>>()("app/Counter") {
  static readonly layer = Layer.effect(Counter, Ref.make(0))
}

layer(Counter.layer)("Counter", (it) => {
  it.effect("increments the counter", () =>
    Effect.gen(function* () {
      const counter = yield* Counter
      yield* Ref.update(counter, (value) => value + 1)
      expect(yield* Ref.get(counter)).toBe(1)
    })
  )
})
