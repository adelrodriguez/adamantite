import type * as Layer from "effect/Layer"
import * as NodeServices from "@effect/platform-node/NodeServices"
import * as Effect from "effect/Effect"

export type TestEither<A, E> =
  | { readonly _tag: "Left"; readonly left: E }
  | { readonly _tag: "Right"; readonly right: A }

export function isLeft<A, E>(
  either: TestEither<A, E>
): either is Extract<TestEither<A, E>, { readonly _tag: "Left" }> {
  return either._tag === "Left"
}

export async function runEither<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  layer: Layer.Layer<R> = NodeServices.layer as Layer.Layer<R>
): Promise<TestEither<A, E>> {
  const provided = effect.pipe(Effect.provide(layer)) as Effect.Effect<A, E>

  return await Effect.runPromise(
    provided.pipe(
      Effect.match({
        onFailure: (left) => ({ _tag: "Left" as const, left }),
        onSuccess: (right) => ({ _tag: "Right" as const, right }),
      })
    )
  )
}
