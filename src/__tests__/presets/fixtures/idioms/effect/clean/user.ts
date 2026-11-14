import { Schema } from "effect"

export class User extends Schema.Class<User, { readonly brand: unique symbol }>("app/User")({
  id: Schema.Int,
  name: Schema.NonEmptyString,
  role: Schema.Literals(["admin", "member"]),
}) {}

export const decodeUser = Schema.decodeUnknownEffect(User)
export const encodeUser = Schema.encodeEffect(User)
