import type { ESTree } from "@oxlint/plugins"

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

  if (!fields.has("type"))
    throw new Error("Child node invariant: AST node fields are not own enumerable properties")

  return (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value = fields.get(key)

    if (isNode(value)) return [value]

    return Array.isArray(value) ? value.filter(isNode) : []
  })
}
