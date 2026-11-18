import * as Effect from "effect/Effect"

export const failure = Effect.fail({ _tag: "NotFound", path: "config.json" })
