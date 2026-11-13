import * as Schema from "effect/Schema"

export class NotFound extends Schema.TaggedError<NotFound, { readonly brand: unique symbol }>()(
  "NotFound",
  { id: Schema.String }
) {}
