import { Context, Effect, Layer } from "effect"

class Prefix extends Context.Service<Prefix, { readonly value: string }>()("app/Prefix") {
  static readonly layer = Layer.succeed(Prefix, { value: "Hello" })
}

export class Greeting extends Context.Service<Greeting, { readonly text: string }>()(
  "app/Greeting"
) {
  static readonly layerNoDeps = Layer.effect(
    Greeting,
    Effect.gen(function* () {
      const prefix = yield* Prefix

      return Greeting.of({ text: `${prefix.value} Ada` })
    })
  )
  static readonly layer = Greeting.layerNoDeps.pipe(Layer.provide(Prefix.layer))
  static readonly layerWithPrefix = Greeting.layerNoDeps.pipe(Layer.provideMerge(Prefix.layer))
}
