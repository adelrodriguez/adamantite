import { Effect, Schema } from "effect"

export class FileProcessingError extends Schema.TaggedError<
  FileProcessingError,
  { readonly brand: unique symbol }
>()("FileProcessingError", { message: Schema.String }) {}

export const processFile = Effect.gen(function* () {
  yield* Effect.log("Reading file")

  return yield* new FileProcessingError({ message: "Failed to read the file" })
}).pipe(
  Effect.catch((error) => Effect.logError(error.message)),
  Effect.withSpan("fileProcessing")
)
