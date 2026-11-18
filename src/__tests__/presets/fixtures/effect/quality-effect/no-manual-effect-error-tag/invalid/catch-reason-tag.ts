import * as Effect from "effect/Effect"

declare const program: Effect.Effect<string, { readonly reason: { readonly _tag: "NotFound" } }>

export const recovered = program.pipe(
  Effect.catch((error) =>
    error.reason._tag === "NotFound" ? Effect.succeed("") : Effect.fail(error)
  )
)
