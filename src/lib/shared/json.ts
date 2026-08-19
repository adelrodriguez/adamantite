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

export function serializeTsObjectLiteral(
  value: JsonValue,
  options: {
    continuationIndent?: string
    indentation?: number | string
  } = {}
) {
  const { continuationIndent, indentation = 2 } = options
  const serialized = JSON.stringify(value, null, indentation).replaceAll(
    /"([A-Za-z_$][\w$]*)":/g,
    "$1:"
  )

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
