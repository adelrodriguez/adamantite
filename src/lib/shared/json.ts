import type { JsonObject, JsonValue } from "type-fest"
import { defu } from "defu"

import * as Effect from "effect/Effect"
import * as Equal from "effect/Equal"

import type * as Schema from "effect/Schema"
import * as Predicate from "effect/Predicate"
import {
  type FormattingOptions,
  type JSONPath,
  type ParseError,
  applyEdits,
  findNodeAtLocation,
  modify,
  parse,
  parseTree,
} from "jsonc-parser"
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

export const mergeConfig = (base: Schema.JsonObject, override: Schema.JsonObject) =>
  Effect.try({
    catch: (cause) => new FailedToMergeConfig({ cause }),
    try: () => defu(base, override),
  })

// The first indented property line shows the file's indentation. A file without one, such as `{}`,
// gets two spaces, the format of every file that Adamantite creates.
const PROPERTY_INDENTATION_REGEX = /^([ \t]+)"/mu

function detectFormattingOptions(content: string): FormattingOptions {
  const indentation = PROPERTY_INDENTATION_REGEX.exec(content)?.[1] ?? "  "
  const eol = content.includes("\r\n") ? "\r\n" : "\n"

  return indentation.startsWith("\t")
    ? { eol, insertSpaces: false, tabSize: 1 }
    : { eol, insertSpaces: true, tabSize: indentation.length }
}

function collectJsonChanges(
  current: Schema.Json | undefined,
  next: Schema.Json | undefined,
  path: JSONPath
): Array<readonly [JSONPath, Schema.Json | undefined]> {
  if (checkIsJsonObject(current) && checkIsJsonObject(next)) {
    const keys = [
      ...Object.keys(current),
      ...Object.keys(next).filter((key) => !Object.hasOwn(current, key)),
    ]

    return keys.flatMap((key) => collectJsonChanges(current[key], next[key], [...path, key]))
  }

  return Equal.equals(current, next) ? [] : [[path, next]]
}

// The comments, with the spaces before them, that end a property's line, after an optional comma.
const TRAILING_COMMENT_REGEX =
  /^(?<comma>[ \t]*,)?(?<comment>(?:[ \t]*(?:\/\/[^\r\n]*|\/\*[^\r\n]*?\*\/))+)/u

function countKeys(text: string, path: JSONPath): number {
  const key = path.at(-1)
  const root = parseTree(text)
  const parent = root && findNodeAtLocation(root, path.slice(0, -1))

  return parent?.type === "object"
    ? (parent.children ?? []).filter((property) => property.children?.[0]?.value === key).length
    : 0
}

// Parsing keeps the last of repeated keys, but jsonc-parser edits the first. Remove the earlier
// keys on the path, which have no effect, so the edit reaches the key that parsing keeps.
function removeShadowedKeys(
  text: string,
  path: JSONPath,
  formattingOptions: FormattingOptions
): string {
  let result = text

  for (const depth of path.keys()) {
    const prefix = path.slice(0, depth + 1)

    while (countKeys(result, prefix) > 1) {
      result = applyEdits(result, modify(result, prefix, undefined, { formattingOptions }))
    }
  }

  return result
}

function setJsonValue(
  text: string,
  path: JSONPath,
  value: Schema.Json | undefined,
  formattingOptions: FormattingOptions
): string {
  const edit = (source: string) =>
    applyEdits(source, modify(source, path, value, { formattingOptions }))
  const root = parseTree(text)
  const parentPath = path.slice(0, -1)
  const last = root && findNodeAtLocation(root, parentPath)?.children?.at(-1)
  const lastKey = last?.children?.[0]?.value

  if (
    value === undefined
    || root === undefined
    || findNodeAtLocation(root, path) !== undefined
    || last?.type !== "property"
    || !Predicate.isString(lastKey)
  ) {
    return edit(text)
  }

  const lastEnd = last.offset + last.length
  const match = TRAILING_COMMENT_REGEX.exec(text.slice(lastEnd))

  if (match?.groups?.comment === undefined) {
    return edit(text)
  }

  // jsonc-parser inserts a new key directly after the last value, so the comment that ends that
  // line would follow the new key. Take the comment out, add the key, and put it back.
  const commentStart = lastEnd + (match.groups.comma?.length ?? 0)
  const comment = match.groups.comment
  const updated = edit(text.slice(0, commentStart) + text.slice(commentStart + comment.length))
  const updatedRoot = parseTree(updated)
  const property = updatedRoot && findNodeAtLocation(updatedRoot, [...parentPath, lastKey])?.parent
  const propertyEnd = property ? property.offset + property.length : commentStart
  const insertAt = propertyEnd + (/^[ \t]*,/u.exec(updated.slice(propertyEnd))?.[0].length ?? 0)

  return updated.slice(0, insertAt) + comment + updated.slice(insertAt)
}

/**
 * Rewrites JSON or JSONC text so that it holds `next`, and edits only the values that change.
 * Comments, indentation, line endings, and key order stay as they are in the rest of the file. New
 * keys go at the end of their object, and a changed array or primitive is replaced whole. A removed
 * key also removes the comments between it and the previous value.
 */
export function updateJsonText(content: string, next: Schema.Json): string {
  // SAFETY: jsonc-parser returns plain JSON data; callers parse the same content first.
  const current = parse(content, [], { allowTrailingComma: true }) as Schema.Json
  const formattingOptions = detectFormattingOptions(content)

  return collectJsonChanges(current, next, []).reduce(
    (text, [path, value]) =>
      setJsonValue(
        removeShadowedKeys(text, path, formattingOptions),
        path,
        value,
        formattingOptions
      ),
    content
  )
}
