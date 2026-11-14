import { Effect, Schema } from "effect"

export class ValidationError extends Schema.TaggedError<
  ValidationError,
  { readonly brand: unique symbol }
>()("ValidationError", {
  message: Schema.String,
}) {}

export class NetworkError extends Schema.TaggedError<
  NetworkError,
  { readonly brand: unique symbol }
>()("NetworkError", {
  statusCode: Schema.Int,
}) {}

export function recover(request: Effect.Effect<string, ValidationError | NetworkError>) {
  return request.pipe(
    Effect.catchTags({
      ValidationError: (error) => Effect.succeed(`Validation failed: ${error.message}`),
      NetworkError: (error) => Effect.succeed(`Network failed: ${error.statusCode}`),
    })
  )
}
