import type { JsonObject, JsonValue } from "type-fest"

import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

const JsonText = Schema.fromJsonString(Schema.Unknown)
const IndentedJsonText = Schema.fromJsonString(Schema.Unknown, { space: 2 })

export const stringifyJson = Schema.encodeEffect(JsonText)

export const formatJson = Schema.encodeEffect(IndentedJsonText)

export function checkIsJsonObject(value: JsonValue | Schema.Json | undefined): value is JsonObject {
  return Predicate.isObject(value)
}

export function checkIsJsonArray(value: JsonValue | Schema.Json | undefined): value is JsonValue[] {
  return Array.isArray(value)
}
