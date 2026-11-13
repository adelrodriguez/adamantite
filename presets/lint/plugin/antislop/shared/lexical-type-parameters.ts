import type { ESTree } from "@oxlint/plugins"
import { childNodes, type VisitorKeys } from "./child-nodes.ts"

function collectInferTypeParameterNames(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  names: Set<string>
): void {
  if (node.type === "TSInferType") names.add(node.typeParameter.name.name)

  for (const child of childNodes(node, visitorKeys)) {
    collectInferTypeParameterNames(child, visitorKeys, names)
  }
}

/**
 * Collect type binders that are in scope at a node and can shadow module aliases. With `outer`,
 * collect only the binders below that ancestor, which shadow its own type parameters.
 */
export function lexicalTypeParameterNames(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  outer?: ESTree.Node
): ReadonlySet<string> {
  const names = new Set<string>()
  let descendant: ESTree.Node = node
  let current: ESTree.Node = node

  while (current.type !== "Program" && current !== outer) {
    if ("typeParameters" in current) {
      for (const parameter of current.typeParameters?.params ?? []) {
        names.add(parameter.name.name)
      }
    }

    if (
      current.type === "TSMappedType"
      && (descendant === current.nameType || descendant === current.typeAnnotation)
    ) {
      names.add(current.key.name)
    }

    if (current.type === "TSConditionalType" && descendant === current.trueType) {
      collectInferTypeParameterNames(current.extendsType, visitorKeys, names)
    }

    descendant = current
    current = current.parent
  }

  return names
}
