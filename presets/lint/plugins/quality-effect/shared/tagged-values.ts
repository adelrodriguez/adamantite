import type { ESTree } from "@oxlint/plugins"
import { isStringLiteral, staticKeyName } from "../../shared/ast.ts"

const equalityOperators = new Set(["==", "===", "!=", "!=="])
const broadEffectCatchMethods = new Set(["catch", "catchAll", "catchIf"])

export function isTagMember(node: ESTree.Node | null | undefined): node is ESTree.MemberExpression {
  return node?.type === "MemberExpression" && staticKeyName(node.property, node.computed) === "_tag"
}

export function tagMemberFromComparison(
  node: ESTree.BinaryExpression
): ESTree.MemberExpression | undefined {
  if (!equalityOperators.has(node.operator)) {
    return undefined
  }

  if (isTagMember(node.left) && isStringLiteral(node.right)) {
    return node.left
  }

  if (isTagMember(node.right) && isStringLiteral(node.left)) {
    return node.right
  }

  return undefined
}

function isBroadEffectCatchCall(
  node: ESTree.Node | null | undefined
): node is ESTree.CallExpression {
  return (
    node?.type === "CallExpression"
    && node.callee.type === "MemberExpression"
    && node.callee.object.type === "Identifier"
    && node.callee.object.name === "Effect"
    && broadEffectCatchMethods.has(staticKeyName(node.callee.property, node.callee.computed) ?? "")
  )
}

export function isInsideBroadEffectHandler(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent

  while (current !== null) {
    if (current.type === "ArrowFunctionExpression" || current.type === "FunctionExpression") {
      return isBroadEffectCatchCall(current.parent) && current.parent.arguments.includes(current)
    }

    current = current.parent
  }

  return false
}

export function isReasonTagMember(node: ESTree.MemberExpression): boolean {
  return (
    node.object.type === "MemberExpression"
    && staticKeyName(node.object.property, node.object.computed) === "reason"
  )
}

export function propertyName(property: ESTree.ObjectProperty): string | undefined {
  return staticKeyName(property.key, property.computed) ?? undefined
}

export function isMatchPatternObject(node: ESTree.ObjectExpression): boolean {
  const call = node.parent

  if (call.type !== "CallExpression" || !call.arguments.includes(node)) {
    return false
  }

  const callee = call.callee

  return (
    callee.type === "MemberExpression"
    && callee.object.type === "Identifier"
    && callee.object.name === "Match"
    && ["not", "when"].includes(staticKeyName(callee.property, callee.computed) ?? "")
  )
}
