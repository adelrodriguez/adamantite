import type { JsonObject, JsonValue } from "type-fest"
import { defu } from "defu"

import * as Effect from "effect/Effect"

import type * as Schema from "effect/Schema"
import * as Predicate from "effect/Predicate"
import { type ParseError, parse } from "jsonc-parser"
import { FailedToMergeConfig, FailedToParseFile } from "#lib/shared/errors.ts"

export const parseJson = (content: string, path?: string) =>
  Effect.suspend(() => {
    const errors: ParseError[] = []
    // SAFETY: jsonc-parser returns plain JSON data; parse failures surface through `errors`.
    const parsed = parse(content, errors, { allowTrailingComma: true }) as JsonValue

    return errors.length > 0
      ? Effect.fail(new FailedToParseFile({ errors, path }))
      : Effect.succeed(parsed)
  })

export const checkIsJsonObject = (
  value: JsonValue | Schema.Json | undefined
): value is JsonObject => Predicate.isObject(value)

export const checkIsJsonArray = (
  value: JsonValue | Schema.Json | undefined
): value is JsonValue[] => Array.isArray(value)

export function serializeTsPropertyKey(key: string) {
  // A quoted "__proto__" key still means prototype assignment in an object literal
  // (ECMAScript Annex B.3.1); only the computed form keeps it as an own property.
  if (key === "__proto__") {
    return '["__proto__"]'
  }

  return /^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key)
}

export function serializeTsObjectLiteral(
  value: JsonValue,
  options: {
    continuationIndent?: string
    indentation?: number | string
  } = {}
) {
  const { continuationIndent, indentation = 2 } = options
  // Both replacements skip quotes preceded by a backslash: an unescaped `"` in
  // JSON.stringify output is always a real string boundary, so the lookbehind keeps the
  // rewrites from matching inside keys that contain escaped quotes.
  const serialized = JSON.stringify(value, null, indentation)
    // Same Annex B.3.1 hazard as serializeTsPropertyKey: only the computed form keeps
    // __proto__ as an own property.
    .replaceAll(/(?<!\\)"__proto__":/g, '["__proto__"]:')
    .replaceAll(/(?<!\\)"([A-Za-z_$][\w$]*)":/g, "$1:")

  if (!continuationIndent) {
    return serialized
  }

  return serialized.replaceAll("\n", `\n${continuationIndent}`)
}

export const mergeConfig = (base: Schema.JsonObject, override: Schema.JsonObject) =>
  Effect.try({
    catch: (cause) => new FailedToMergeConfig({ cause }),
    try: () => defu(base, override),
  })
