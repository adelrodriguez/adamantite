import type { ESTree } from "@oxlint/plugins"

/**
 * Return whether a node is a string literal, such as `"get"` in `Reflect["get"]`.
 */
export function isStringLiteral(node: ESTree.Node): node is ESTree.StringLiteral {
  return node.type === "Literal" && typeof node.value === "string"
}
