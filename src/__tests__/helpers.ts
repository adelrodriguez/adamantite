import type * as Layer from "effect/Layer"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"

export function runResult<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  // SAFETY: tests that omit `layer` only run effects whose requirements are Node platform services, all of which NodeServices.layer provides.
  layer: Layer.Layer<R> = NodeServices.layer as Layer.Layer<R>
) {
  const provided = effect.pipe(Effect.provide(layer))

  return provided.pipe(Effect.result)
}
