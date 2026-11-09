import * as Effect from "effect/Effect"

declare const program: Effect.Effect<string, { readonly _tag: "NotFound" | "Timeout" }>

export const recovered = program.pipe(
  Effect.catch((error) => (error._tag === "NotFound" ? Effect.succeed("") : Effect.fail(error)))
)
