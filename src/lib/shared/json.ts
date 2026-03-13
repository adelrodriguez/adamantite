import type { JsonObject, JsonValue } from "type-fest"
import { defu } from "defu"
import * as Effect from "effect/Effect"
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

export function isJsonObject(value: unknown): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

export const mergeConfig = (base: Record<string, unknown>, override: Record<string, unknown>) =>
  Effect.try({
    catch: (cause) => new FailedToMergeConfig({ cause }),
    try: () => defu(base, override),
  })
