import type { JsonObject, JsonValue } from "type-fest"

import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"

const JsonText = Schema.fromJsonString(Schema.Unknown)
const IndentedJsonText = Schema.fromJsonString(Schema.Unknown, { space: 2 })

/**
 * Encodes a value as JSON text on one line. A value that JSON cannot hold fails with a
 * `SchemaError`.
 */
export const stringifyJson = Schema.encodeEffect(JsonText)

/**
 * Encodes a value as JSON text with two-space indentation. `Setup.apply` formats a managed file
 * with the project's Oxfmt before it writes it. A value that JSON cannot hold fails with a
 * `SchemaError`.
 */
export const formatJson = Schema.encodeEffect(IndentedJsonText)

export const checkIsJsonObject = (
  value: JsonValue | Schema.Json | undefined
): value is JsonObject => Predicate.isObject(value)

export const checkIsJsonArray = (
  value: JsonValue | Schema.Json | undefined
): value is JsonValue[] => Array.isArray(value)
