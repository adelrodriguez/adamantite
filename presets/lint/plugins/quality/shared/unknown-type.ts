import type { ESTree } from "@oxlint/plugins"

import { childNodes, type VisitorKeys } from "../../shared/ast.ts"
import {
  hasVisibleTypeBinding,
  namedTypeReference,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "./type-alias-resolution.ts"

// `Awaited<unknown>` and `NoInfer<unknown>` are `unknown`. `Readonly<unknown>` is `{}`.
const TRANSPARENT_TYPES: ReadonlySet<string> = new Set(["Awaited", "NoInfer"])

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

export function builtInTypeName(
  type: ESTree.TSTypeReference,
  environment: TypeAliasEnvironment
): string | null {
  const reference = namedTypeReference(type)

  if (reference === null) {
    return null
  }

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
    if (resolved.type === "TSUnknownKeyword") {
      return true
    }

    if (resolved.type === "TSParenthesizedType") {
      return matches(resolved.typeAnnotation)
    }

    if (resolved.type === "TSUnionType") {
      return resolved.types.some(matches)
    }

    if (resolved.type !== "TSTypeReference") {
      return false
    }

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

export function resolvesToUnknown(type: ESTree.TSType, environment: TypeAliasEnvironment): boolean {
  return matchesUnknown(type, environment, NO_CONTAINER_TYPES)
}

export function exposesUnknown(type: ESTree.TSType, environment: TypeAliasEnvironment): boolean {
  return matchesUnknown(type, environment, CONTAINER_TYPES)
}

const UNCHECKED_TYPES: ReadonlySet<string> = new Set(["TSAnyKeyword", "TSUnknownKeyword"])

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

export function mentionsUncheckedType(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment
): boolean {
  return resolvedTypeMatches(type, environment, (resolved, matches) =>
    containsUncheckedType(resolved, environment.visitorKeys, matches)
  )
}
