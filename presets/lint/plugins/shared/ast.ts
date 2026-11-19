import type { ESTree } from "@oxlint/plugins"

export function isStringLiteral(node: ESTree.Node): node is ESTree.StringLiteral {
  return node.type === "Literal" && typeof node.value === "string"
}

export function isNumberLiteral(node: ESTree.Node): node is ESTree.NumericLiteral {
  return node.type === "Literal" && typeof node.value === "number"
}

export function unwrapExpression(expression: ESTree.Node): ESTree.Node {
  let node = expression

  while (
    node.type === "ParenthesizedExpression"
    || node.type === "ChainExpression"
    || node.type === "TSAsExpression"
    || node.type === "TSTypeAssertion"
    || node.type === "TSNonNullExpression"
    || node.type === "TSSatisfiesExpression"
  ) {
    node = node.expression
  }

  return node
}

export function staticString(node: ESTree.Expression): string | null {
  switch (node.type) {
    case "Literal":
      return typeof node.value === "string" ? node.value : null

    case "TemplateLiteral":
      return node.expressions.length === 0 ? (node.quasis[0]?.value.cooked ?? null) : null

    case "TSAsExpression":
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
    case "TSTypeAssertion":
      return staticString(node.expression)

    default:
      return null
  }
}

export function staticKeyName(key: ESTree.Node, computed: boolean): string | null {
  if (!computed && key.type === "Identifier") {
    return key.name
  }

  if (isStringLiteral(key)) {
    return key.value
  }

  if (isNumberLiteral(key)) {
    return String(key.value)
  }

  if (computed && key.type === "TemplateLiteral" && key.expressions.length === 0) {
    return key.quasis[0]?.value.cooked ?? null
  }

  return null
}

export type VisitorKeys = Readonly<Record<string, readonly string[]>>

function isNode(value: unknown): value is ESTree.Node {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  )
}

export function childNodes(
  node: Pick<ESTree.Node, "type">,
  visitorKeys: VisitorKeys
): readonly ESTree.Node[] {
  const fields = new Map(Object.entries(node))

  // Oxlint builds each node as a plain object with own enumerable fields. Without this guard, a
  // later version that does not would leave the rules without child nodes, and without an error.
  if (!fields.has("type")) {
    throw new Error("Child node invariant: AST node fields are not own enumerable properties")
  }

  return (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value = fields.get(key)

    if (isNode(value)) {
      return [value]
    }

    return Array.isArray(value) ? value.filter(isNode) : []
  })
}
