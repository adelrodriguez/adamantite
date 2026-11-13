import type { ESTree, SourceCode } from "@oxlint/plugins"

import { staticKeyName } from "./literals.ts"
import { isGlobalObject, matchesThroughAliases, readsProperty } from "./scope.ts"

type ReflectArgument = ESTree.Expression | ESTree.SpreadElement | null

/**
 * A call of one Reflect method. `listed` holds the arguments that the method gets, in order.
 * `hidden` is a call through `apply` with an argument list that the rule cannot read.
 */
type ReflectMethodCall =
  | { readonly arguments: readonly ReflectArgument[]; readonly kind: "listed" }
  | { readonly kind: "hidden" }

/**
 * Reports whether an expression reads one Reflect method, such as `Reflect.get`,
 * `globalThis.Reflect.get`, `R.get` after `const R = Reflect`, or a method that the code
 * destructures from Reflect.
 */
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

/**
 * Match a call of one method on the global Reflect object, such as `Reflect.get(target, key)`,
 * `get.call(null, target, key)` after `const { get } = Reflect`, or
 * `globalThis.Reflect.get.apply(null, [target, key])`. Return null for any other call. A local
 * binding that shadows `Reflect` or `globalThis` is not the global object.
 */
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

  if (forwarder === "call") return { arguments: call.arguments.slice(1), kind: "listed" }

  if (forwarder !== "apply") return null
  const list = call.arguments[1]

  return list?.type === "ArrayExpression"
    ? { arguments: list.elements, kind: "listed" }
    : { kind: "hidden" }
}
