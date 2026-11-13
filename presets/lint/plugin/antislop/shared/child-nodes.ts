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
 * Return the child nodes of a node, in the order of its visitor keys.
 */
export function childNodes(node: ESTree.Node, visitorKeys: VisitorKeys): readonly ESTree.Node[] {
  const fields = new Map(Object.entries(node))

  return (visitorKeys[node.type] ?? []).flatMap((key) => {
    const value = fields.get(key)

    if (isNode(value)) return [value]

    return Array.isArray(value) ? value.filter(isNode) : []
  })
}
