import * as Effect from "effect/Effect"

declare const program: Effect.Effect<string, { readonly _tag: "NotFound" }>

export const recovered = program.pipe(Effect.catchTag("NotFound", () => Effect.succeed("")))
