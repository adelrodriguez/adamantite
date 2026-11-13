import type { ESTree } from "@oxlint/plugins"

/**
 * Return whether a node is a string literal, such as `"get"` in `Reflect["get"]`.
 */
export function isStringLiteral(node: ESTree.Node): node is ESTree.StringLiteral {
  return node.type === "Literal" && typeof node.value === "string"
}

/**
 * Return whether a node is a number literal, such as `2` in `acc.slice(-2)`.
 */
export function isNumberLiteral(node: ESTree.Node): node is ESTree.NumericLiteral {
  return node.type === "Literal" && typeof node.value === "number"
}
