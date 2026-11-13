import type { ESTree } from "@oxlint/plugins"
import { childNodes, type VisitorKeys } from "../../shared/ast.ts"

/**
 * A type binder in scope at a node. `distance` counts the steps from the node up to the node that
 * declares the binder, so a smaller distance is a nearer scope.
 */
export type LexicalTypeParameter = {
  readonly declaration: ESTree.TSMappedType | ESTree.TSTypeParameter
  readonly distance: number
  readonly name: string
}

function collectInferTypeParameters(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  parameters: ESTree.TSTypeParameter[]
): void {
  if (node.type === "TSInferType") parameters.push(node.typeParameter)

  for (const child of childNodes(node, visitorKeys)) {
    collectInferTypeParameters(child, visitorKeys, parameters)
  }
}

/**
 * Collect type binders that are in scope at a node and can shadow module aliases, nearest first.
 * With `outer`, collect only the binders below that ancestor, which shadow its own type
 * parameters.
 */
export function lexicalTypeParameters(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  outer?: ESTree.Node
): readonly LexicalTypeParameter[] {
  const binders: LexicalTypeParameter[] = []
  let descendant: ESTree.Node = node
  let current: ESTree.Node = node
  let distance = 0

  while (current.type !== "Program" && current !== outer) {
    if ("typeParameters" in current) {
      for (const parameter of current.typeParameters?.params ?? []) {
        binders.push({ declaration: parameter, distance, name: parameter.name.name })
      }
    }

    if (
      current.type === "TSMappedType"
      && (descendant === current.nameType || descendant === current.typeAnnotation)
    ) {
      binders.push({ declaration: current, distance, name: current.key.name })
    }

    if (current.type === "TSConditionalType" && descendant === current.trueType) {
      const inferred: ESTree.TSTypeParameter[] = []
      collectInferTypeParameters(current.extendsType, visitorKeys, inferred)

      for (const parameter of inferred) {
        binders.push({ declaration: parameter, distance, name: parameter.name.name })
      }
    }

    descendant = current
    current = current.parent
    distance += 1
  }

  return binders
}

/**
 * Collect the names of the type binders that are in scope at a node. See `lexicalTypeParameters`.
 */
export function lexicalTypeParameterNames(
  node: ESTree.Node,
  visitorKeys: VisitorKeys,
  outer?: ESTree.Node
): ReadonlySet<string> {
  return new Set(lexicalTypeParameters(node, visitorKeys, outer).map(({ name }) => name))
}
