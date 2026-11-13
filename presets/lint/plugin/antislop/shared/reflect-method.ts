import type { ESTree, SourceCode, Variable } from "@oxlint/plugins"

import { staticKeyName } from "./literals.ts"
import { constBinding, isGlobalObject, resolveVariable } from "./scope.ts"

type ReflectArgument = ESTree.Expression | ESTree.SpreadElement | null

/**
 * A call of one Reflect method. `listed` holds the arguments that the method gets, in order.
 * `hidden` is a call through `apply` with an argument list that the rule cannot read.
 */
type ReflectMethodCall =
  | { readonly arguments: readonly ReflectArgument[]; readonly kind: "listed" }
  | { readonly kind: "hidden" }

/**
 * Return the `const` binding that an identifier reads, or null for any other expression. `visited`
 * stops a cycle of bindings.
 */
function resolveConstBinding(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  visited: Set<Variable>
) {
  if (expression.type !== "Identifier") return null
  const variable = resolveVariable(sourceCode, expression)

  if (variable === null || visited.has(variable)) return null
  visited.add(variable)

  return constBinding(variable)
}

/**
 * Reports whether an expression reads the global Reflect object, directly, through
 * `globalThis.Reflect`, or through a `const` alias.
 */
function isReflect(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  visited: Set<Variable>
): boolean {
  if (isGlobalObject(sourceCode, expression, "Reflect")) return true
  const binding = resolveConstBinding(sourceCode, expression, visited)

  return binding?.id.type === "Identifier" && isReflect(sourceCode, binding.init, visited)
}

/**
 * Reports whether an expression reads one Reflect method, such as `Reflect.get`, or a `const`
 * binding of it, such as `const { get } = Reflect` or `const read = Reflect.get`.
 */
function isReflectMethod(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  methodName: string,
  visited: Set<Variable>
): boolean {
  if (expression.type === "MemberExpression") {
    return (
      staticKeyName(expression.property, expression.computed) === methodName
      && isReflect(sourceCode, expression.object, visited)
    )
  }

  const binding = resolveConstBinding(sourceCode, expression, visited)

  if (binding === null) return false
  const { id, init } = binding

  if (id.type === "Identifier") return isReflectMethod(sourceCode, init, methodName, visited)

  return (
    id.type === "ObjectPattern"
    && expression.type === "Identifier"
    && id.properties.some(
      (property) =>
        property.type === "Property"
        && property.value.type === "Identifier"
        && property.value.name === expression.name
        && staticKeyName(property.key, property.computed) === methodName
    )
    && isReflect(sourceCode, init, visited)
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

  if (isReflectMethod(sourceCode, callee, methodName, new Set())) {
    return { arguments: call.arguments, kind: "listed" }
  }

  if (
    callee.type !== "MemberExpression"
    || !isReflectMethod(sourceCode, callee.object, methodName, new Set())
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
