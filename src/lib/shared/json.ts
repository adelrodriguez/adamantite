import type { JsonObject, JsonValue } from "type-fest"

import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import * as Option from "effect/Option"

import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { FailedToMergeConfig } from "#lib/shared/errors.ts"

const JsonText = Schema.fromJsonString(Schema.Unknown)
const IndentedJsonText = Schema.fromJsonString(Schema.Unknown, { space: 2 })

/**
 * Encodes a value as JSON text on one line. A value that JSON cannot hold fails with a
 * `SchemaError`.
 */
export const stringifyJson = Schema.encodeEffect(JsonText)

/**
 * Encodes a value as JSON text with two-space indentation, the format of every file that Adamantite
 * creates. A value that JSON cannot hold fails with a `SchemaError`.
 */
export const formatJson = Schema.encodeEffect(IndentedJsonText)

export const checkIsJsonObject = (
  value: JsonValue | Schema.Json | undefined
): value is JsonObject => Predicate.isObject(value)

export const checkIsJsonArray = (
  value: JsonValue | Schema.Json | undefined
): value is JsonValue[] => Array.isArray(value)

interface ConfigLayers {
  /**
   * The object whose values win.
   */
  readonly preferred: Schema.JsonObject
  /**
   * The object that supplies only the keys that `preferred` does not set.
   */
  readonly fallback: Schema.JsonObject
}

function mergeJsonValues(
  preferred: Schema.Json | undefined,
  fallback: Schema.Json | undefined
): Schema.Json | undefined {
  if (preferred === undefined) {
    return fallback
  }

  if (checkIsJsonObject(preferred) && checkIsJsonObject(fallback)) {
    return mergeJsonObjects(preferred, fallback)
  }

  if (checkIsJsonArray(preferred) && checkIsJsonArray(fallback)) {
    return [...preferred, ...fallback]
  }

  // A null is a value that the preferred object sets, such as a setting turned off.
  return preferred
}

function mergeJsonObjects(
  preferred: Schema.JsonObject,
  fallback: Schema.JsonObject
): Schema.JsonObject {
  const keys = [
    ...Object.keys(preferred),
    ...Object.keys(fallback).filter((key) => !Object.hasOwn(preferred, key)),
  ]

  return Object.fromEntries(
    keys.flatMap((key) => {
      // Only own keys count, so a key such as `toString` does not read the prototype.
      const value = mergeJsonValues(
        Object.hasOwn(preferred, key) ? preferred[key] : undefined,
        Object.hasOwn(fallback, key) ? fallback[key] : undefined
      )

      return value === undefined ? [] : [[key, value] as const]
    })
  )
}

/**
 * Merges two JSON objects deeply. `preferred` wins each key that it sets, also with `null`, and
 * arrays join with the `preferred` items first.
 */
export const mergeConfig = ({ fallback, preferred }: ConfigLayers) =>
  Effect.try({
    catch: (cause) => new FailedToMergeConfig({ cause }),
    try: () => mergeJsonObjects(preferred, fallback),
  })

/**
 * The entries of `next` whose values differ from `current`. A setting that Adamantite cannot write
 * is shown to the user as these entries.
 */
export function pickChangedEntries(
  current: Schema.JsonObject,
  next: Schema.JsonObject
): Schema.JsonObject {
  return Object.fromEntries(
    // Only own keys count, so a key such as `toString` does not read the prototype.
    Object.entries(next).filter(
      ([key, value]) => !Object.hasOwn(current, key) || !Equal.equals(current[key], value)
    )
  )
}

/**
 * Whether `content` is plain JSON, without comments or trailing commas. Adamantite rewrites only
 * plain JSON, because a rewrite drops comments.
 */
export function checkIsPlainJson(content: string): boolean {
  return Option.isSome(Schema.decodeOption(JsonText)(content))
}
