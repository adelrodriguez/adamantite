import type { JsonObject, JsonValue } from "type-fest"

import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"
import { flow } from "effect/Function"
import * as Option from "effect/Option"

import * as Predicate from "effect/Predicate"
import * as Schema from "effect/Schema"
import { FailedToMergeConfig } from "#lib/shared/errors.ts"

const JsonText = Schema.fromJsonString(Schema.Unknown)

/**
 * Encodes a value as JSON text on one line. A value that JSON cannot hold fails with a
 * `SchemaError`.
 */
export const stringifyJson = Schema.encodeEffect(JsonText)

export const checkIsJsonObject = (
  value: JsonValue | Schema.Json | undefined
): value is JsonObject => Predicate.isObject(value)

export const checkIsJsonArray = (
  value: JsonValue | Schema.Json | undefined
): value is JsonValue[] => Array.isArray(value)

// The `printWidth` of the format preset.
const PRINT_WIDTH = 100

const INDENT = "  "

/**
 * The value on one line, as Oxfmt prints an array that fits. None when the value holds an object
 * with keys, which Oxfmt always prints on several lines.
 */
function printFlat(value: Schema.Json): Option.Option<string> {
  if (checkIsJsonArray(value)) {
    return Option.map(Option.all(value.map(printFlat)), (items) => `[${items.join(", ")}]`)
  }

  if (checkIsJsonObject(value)) {
    return Object.keys(value).length === 0 ? Option.some("{}") : Option.none()
  }

  return Option.some(JSON.stringify(value))
}

/**
 * The value as Oxfmt prints JSON with the format preset. An object with keys takes one line for
 * each key. An array stays on one line when it fits in the print width, with `column` characters
 * before it and `trailing` characters after it on its line, and takes one line for each item
 * otherwise.
 */
function printJson(value: Schema.Json, indent: string, column: number, trailing: number): string {
  const inner = `${indent}${INDENT}`

  if (checkIsJsonArray(value)) {
    const flat = printFlat(value)

    if (Option.isSome(flat) && column + flat.value.length + trailing <= PRINT_WIDTH) {
      return flat.value
    }

    const items = value.map(
      (item, index) =>
        `${inner}${printJson(item, inner, inner.length, index === value.length - 1 ? 0 : 1)}`
    )

    return `[\n${items.join(",\n")}\n${indent}]`
  }

  if (checkIsJsonObject(value)) {
    const entries = Object.entries(value)

    if (entries.length === 0) {
      return "{}"
    }

    const lines = entries.map(([key, item], index) => {
      const prefix = `${inner}${JSON.stringify(key)}: `

      return `${prefix}${printJson(item, inner, prefix.length, index === entries.length - 1 ? 0 : 1)}`
    })

    return `{\n${lines.join(",\n")}\n${indent}}`
  }

  return JSON.stringify(value)
}

const decodeJsonText = Schema.decodeEffect(Schema.fromJsonString(Schema.Json))

/**
 * Encodes a value as JSON text in the layout that Oxfmt gives it with the format preset, the format
 * of every JSON file that Adamantite writes. `adamantite fix` then leaves the file unchanged, so
 * its hash still matches the lockfile. A value that JSON cannot hold fails with a `SchemaError`.
 */
export const formatJson = flow(
  stringifyJson,
  Effect.flatMap(decodeJsonText),
  Effect.map((json) => printJson(json, "", 0, 0))
)

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
