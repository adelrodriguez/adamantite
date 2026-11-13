import type { ESTree } from "@oxlint/plugins"
import { isStringLiteral, staticKeyName } from "../../shared/ast.ts"

const equalityOperators = new Set(["==", "===", "!=", "!=="])
const broadEffectCatchMethods = new Set(["catch", "catchAll", "catchIf"])

export const isTagMember = (
  node: ESTree.Node | null | undefined
): node is ESTree.MemberExpression =>
  node?.type === "MemberExpression" && staticKeyName(node.property, node.computed) === "_tag"

export const tagMemberFromComparison = (
  node: ESTree.BinaryExpression
): ESTree.MemberExpression | undefined => {
  if (!equalityOperators.has(node.operator)) return undefined

  if (isTagMember(node.left) && isStringLiteral(node.right)) return node.left

  if (isTagMember(node.right) && isStringLiteral(node.left)) return node.right

  return undefined
}

const isBroadEffectCatchCall = (
  node: ESTree.Node | null | undefined
): node is ESTree.CallExpression =>
  node?.type === "CallExpression"
  && node.callee.type === "MemberExpression"
  && node.callee.object.type === "Identifier"
  && node.callee.object.name === "Effect"
  && !node.callee.computed
  && node.callee.property.type === "Identifier"
  && broadEffectCatchMethods.has(node.callee.property.name)

export const isInsideBroadEffectHandler = (node: ESTree.Node): boolean => {
  let current: ESTree.Node | null = node.parent

  while (current !== null) {
    if (current.type === "ArrowFunctionExpression" || current.type === "FunctionExpression") {
      return isBroadEffectCatchCall(current.parent) && current.parent.arguments.includes(current)
    }

    current = current.parent
  }

  return false
}

export const isReasonTagMember = (node: ESTree.MemberExpression): boolean =>
  node.object.type === "MemberExpression"
  && staticKeyName(node.object.property, node.object.computed) === "reason"

export const propertyName = (property: ESTree.ObjectProperty): string | undefined =>
  staticKeyName(property.key, property.computed) ?? undefined

export const isMatchPatternObject = (node: ESTree.ObjectExpression): boolean => {
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
