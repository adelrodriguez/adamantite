import type { ESTree } from "@oxlint/plugins"

import { childNodes, type VisitorKeys } from "../../shared/ast.ts"
import {
  hasVisibleTypeBinding,
  namedTypeReference,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "./type-alias-resolution.ts"

/**
 * Built-in types that are `unknown` when their type argument is `unknown`, as in
 * `NoInfer<unknown>`. `Readonly<unknown>` is `{}`, so `Readonly` is not here.
 */
const TRANSPARENT_TYPES: ReadonlySet<string> = new Set(["Awaited", "NoInfer"])

/**
 * Built-in types that give their first type argument to the code that reads them, as in
 * `Promise<unknown>` or `AsyncIterable<unknown>`.
 */
const CONTAINER_TYPES: ReadonlySet<string> = new Set([
  "AsyncGenerator",
  "AsyncIterable",
  "AsyncIterator",
  "Generator",
  "Iterable",
  "Promise",
  "PromiseLike",
])

const NO_CONTAINER_TYPES: ReadonlySet<string> = new Set()

/**
 * Return the built-in name of a type reference, as `Promise` in `Promise<T>` or
 * `globalThis.Promise<T>`, or null when a local declaration shadows the name.
 */
export function builtInTypeName(
  type: ESTree.TSTypeReference,
  environment: TypeAliasEnvironment
): string | null {
  const reference = namedTypeReference(type)

  if (reference === null) return null

  return reference.global || !hasVisibleTypeBinding(reference.name, type, environment)
    ? reference.name
    : null
}

function matchesUnknown(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment,
  containers: ReadonlySet<string>
): boolean {
  return resolvedTypeMatches(type, environment, (resolved, matches) => {
    if (resolved.type === "TSUnknownKeyword") return true

    if (resolved.type === "TSParenthesizedType") return matches(resolved.typeAnnotation)

    if (resolved.type === "TSUnionType") return resolved.types.some(matches)

    if (resolved.type !== "TSTypeReference") return false
    const name = builtInTypeName(resolved, environment)
    const argument = resolved.typeArguments?.params[0]

    return (
      name !== null
      && argument !== undefined
      && (TRANSPARENT_TYPES.has(name) || containers.has(name))
      && matches(argument)
    )
  })
}

/**
 * Return whether a type is TypeScript's `unknown` top type, or a union that absorbs it. The check
 * resolves local aliases and sees through `Awaited` and `NoInfer`.
 */
export function resolvesToUnknown(type: ESTree.TSType, environment: TypeAliasEnvironment): boolean {
  return matchesUnknown(type, environment, NO_CONTAINER_TYPES)
}

/**
 * Return whether a type gives `unknown` to the code that reads it: the type resolves to `unknown`,
 * or it is a built-in container of `unknown`, as in `Promise<unknown>`.
 */
export function exposesUnknown(type: ESTree.TSType, environment: TypeAliasEnvironment): boolean {
  return matchesUnknown(type, environment, CONTAINER_TYPES)
}

const UNCHECKED_TYPES: ReadonlySet<string> = new Set(["TSAnyKeyword", "TSUnknownKeyword"])

/**
 * Return whether `unknown` or `any` appears in a node or below it. Each type reference below the
 * node goes to `matches`, which resolves it.
 */
function containsUncheckedType(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  matches: (child: ESTree.TSType) => boolean
): boolean {
  return (
    UNCHECKED_TYPES.has(node.type)
    || childNodes(node, visitorKeys).some((child) =>
      child.type === "TSTypeReference"
        ? matches(child)
        : containsUncheckedType(child, visitorKeys, matches)
    )
  )
}

/**
 * Return whether `unknown` or `any` appears anywhere in a type, as in `Record<string, unknown>`.
 * The check resolves local aliases, as in `type Data = unknown`.
 */
export function mentionsUncheckedType(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment
): boolean {
  return resolvedTypeMatches(type, environment, (resolved, matches) =>
    containsUncheckedType(resolved, environment.visitorKeys, matches)
  )
}
