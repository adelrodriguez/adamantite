import type * as Layer from "effect/Layer"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"

export function runResult<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R> = NodeServices.layer as Layer.Layer<R>
) {
  const provided = effect.pipe(Effect.provide(layer))

  return Effect.runPromise(provided.pipe(Effect.result))
}
