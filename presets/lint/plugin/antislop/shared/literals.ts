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

/**
 * Return the name that a property key spells without computing it, such as `get` in `Reflect.get`,
 * `Reflect["get"]`, ``Reflect[`get`]``, or `const { get } = Reflect`. Return null when an
 * expression gives the name.
 */
export function staticKeyName(key: ESTree.Node, computed: boolean): string | null {
  if (!computed && key.type === "Identifier") return key.name

  if (isStringLiteral(key)) return key.value

  if (computed && key.type === "TemplateLiteral" && key.expressions.length === 0) {
    return key.quasis[0]?.value.cooked ?? null
  }

  return null
}
