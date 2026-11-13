import * as Effect from "effect/Effect"

declare const load: (id: string) => Effect.Effect<number, Error>

export const dataFirst = Effect.catch(load("a"), () => load("b"))
