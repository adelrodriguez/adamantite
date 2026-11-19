import type { ESTree, SourceCode } from "@oxlint/plugins"

import { staticKeyName } from "../../shared/ast.ts"
import { isGlobalObject, matchesThroughAliases, readsProperty } from "../../shared/scope.ts"

type ReflectArgument = ESTree.Expression | ESTree.SpreadElement | null

type ReflectMethodCall =
  | { readonly arguments: readonly ReflectArgument[]; readonly kind: "listed" }
  | { readonly kind: "unlisted" }

function isReflectMethod(sourceCode: SourceCode, expression: ESTree.Node, methodName: string) {
  return readsProperty(
    sourceCode,
    expression,
    (name) => name === methodName,
    (owner) =>
      matchesThroughAliases(sourceCode, owner, (node) =>
        isGlobalObject(sourceCode, node, "Reflect")
      )
  )
}

export function matchReflectMethodCall(
  sourceCode: SourceCode,
  call: ESTree.CallExpression,
  methodName: string
): ReflectMethodCall | null {
  const { callee } = call

  if (isReflectMethod(sourceCode, callee, methodName)) {
    return { arguments: call.arguments, kind: "listed" }
  }

  if (
    callee.type !== "MemberExpression"
    || !isReflectMethod(sourceCode, callee.object, methodName)
  ) {
    return null
  }

  const forwarder = staticKeyName(callee.property, callee.computed)

  if (forwarder === "call") {
    return { arguments: call.arguments.slice(1), kind: "listed" }
  }

  if (forwarder !== "apply") {
    return null
  }

  const list = call.arguments[1]

  return list?.type === "ArrayExpression"
    ? { arguments: list.elements, kind: "listed" }
    : { kind: "unlisted" }
}
