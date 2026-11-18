import type { ESTree } from "@oxlint/plugins"

// AST helpers that the adamantite plugin and both quality plugins share. Rule code runs under the
// runtime that executes Oxlint in the target project, so this module imports only types.

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
 * Return the expression inside wrappers that only change its syntax or its type, such as `vi.fn()`
 * in `(vi.fn() as Mock)` or `60_000` in `60_000 as const`.
 */
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

/**
 * Return the string that an expression spells without computing it, such as `./api.ts` in
 * `"./api.ts"`, `` `./api.ts` ``, or `("./api.ts" as const)!`. A type assertion does not change the
 * value, so the string inside one counts. Return null when running the code gives the value, as for
 * a variable, a concatenation, or a template with an expression.
 */
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

/**
 * Return the name that a property key spells without computing it, such as `get` in `Reflect.get`,
 * `Reflect["get"]`, ``Reflect[`get`]``, or `const { get } = Reflect`, and `"0"` in `{ 0: value }`
 * or `{ [0]: value }`. Return null when an expression gives the name.
 */
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

/**
 * The child-node properties of each node type, as `context.sourceCode.visitorKeys` lists them.
 */
export type VisitorKeys = Readonly<Record<string, readonly string[]>>

function isNode(value: unknown): value is ESTree.Node {
  return (
    typeof value === "object" && value !== null && "type" in value && typeof value.type === "string"
  )
}

/**
 * Return the child nodes of a node, in the order of its visitor keys. Oxlint builds each node as a
 * plain object with own enumerable fields. If a later Oxlint version changes that, the function
 * throws, because it would otherwise find no child nodes and the rules that use it would stop
 * without an error.
 */
export function childNodes(
  node: Pick<ESTree.Node, "type">,
  visitorKeys: VisitorKeys
): readonly ESTree.Node[] {
  const fields = new Map(Object.entries(node))

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
