import { Effect, Schema } from "effect"

export class ReservedPortError extends Schema.TaggedError<
  ReservedPortError,
  { readonly brand: unique symbol }
>()("ReservedPortError", { port: Schema.Int }) {}

export function recoverPort(request: Effect.Effect<number, ReservedPortError>) {
  return request.pipe(
    Effect.catchTag("ReservedPortError", (error) =>
      Effect.logWarning(`Reserved port: ${error.port}`).pipe(Effect.as(3000))
    )
  )
}
