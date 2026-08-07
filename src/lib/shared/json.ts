import type { JsonValue } from "type-fest"
import { defu } from "defu"

import * as Effect from "effect/Effect"

import type * as Schema from "effect/Schema"
import { type ParseError, parse } from "jsonc-parser"
import { FailedToMergeConfig, FailedToParseFile } from "#lib/shared/errors.ts"

export const parseJson = (content: string, path?: string) =>
  Effect.sync(() => {
    const errors: ParseError[] = []
    const parsed = parse(content, errors, { allowTrailingComma: true }) as JsonValue
    return { errors, parsed }
  }).pipe(
    Effect.flatMap(({ errors, parsed }) =>
      errors.length > 0
        ? Effect.fail(new FailedToParseFile({ errors, path }))
        : Effect.succeed(parsed)
    )
  )

export function serializeTsObjectLiteral(
  value: unknown,
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
