import * as Effect from "effect/Effect"

declare const load: (id: string) => Effect.Effect<number, Error>

export const nested = load("a").pipe(
  Effect.catch(() => load("b").pipe(Effect.catch(() => load("c"))))
)
