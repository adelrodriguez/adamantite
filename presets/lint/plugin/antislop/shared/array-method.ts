import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins"
import { isStringLiteral } from "./literals.ts"

/**
 * Unwrap syntax-only wrappers when inspecting array methods and accumulator references.
 */
export function unwrapArrayExpression(expression: ESTree.Node): ESTree.Node {
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
 * Resolve a local binding by scope, not by identifier spelling.
 */
export function resolveArrayBinding(
  sourceCode: SourceCode,
  expression: ESTree.Node
): Variable | null {
  const node = unwrapArrayExpression(expression)

  if (node.type !== "Identifier") return null
  let scope: Scope | null = sourceCode.getScope(node)

  while (scope !== null) {
    const variable = scope.set.get(node.name)

    if (variable !== undefined) return variable
    scope = scope.upper
  }

  return null
}

/**
 * Return the initial value of a `const` binding that no code reassigns, or null for any other
 * binding.
 */
export function constInitializer(variable: Variable): ESTree.Expression | null {
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) return null

  for (const definition of variable.defs) {
    if (
      definition.type === "Variable"
      && definition.node.type === "VariableDeclarator"
      && definition.node.id.type === "Identifier"
      && definition.node.init !== null
      && definition.node.parent.type === "VariableDeclaration"
      && definition.node.parent.kind === "const"
    ) {
      return definition.node.init
    }
  }

  return null
}

/**
 * Read static method names, including computed string literals, without evaluating expressions.
 */
export function arrayMethodTarget(
  callee: ESTree.Node
): { readonly name: string; readonly object: ESTree.Node } | null {
  const node = unwrapArrayExpression(callee)

  if (node.type !== "MemberExpression") return null
  const property = node.property

  if (!node.computed && property.type === "Identifier") {
    return { name: property.name, object: node.object }
  }

  if (node.computed && isStringLiteral(property)) {
    return { name: property.value, object: node.object }
  }

  return null
}

function isArrayAnnotation(type: ESTree.TSType): boolean {
  if (type.type === "TSArrayType" || type.type === "TSTupleType") return true

  if (type.type === "TSParenthesizedType") return isArrayAnnotation(type.typeAnnotation)

  if (type.type === "TSTypeOperator" && type.operator === "readonly") {
    return isArrayAnnotation(type.typeAnnotation)
  }

  return (
    type.type === "TSTypeReference"
    && type.typeName.type === "Identifier"
    && (type.typeName.name === "Array" || type.typeName.name === "ReadonlyArray")
  )
}

/**
 * Recognize local array evidence; unknown receivers and iterator pipelines are deliberately
 * excluded.
 */
export function isKnownArrayExpression(sourceCode: SourceCode, expression: ESTree.Node): boolean {
  return isKnownArrayExpressionFrom(sourceCode, expression, new Set())
}

/**
 * Follow bindings to array evidence, and stop at a binding that `visited` already holds.
 */
function isKnownArrayExpressionFrom(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  visited: Set<Variable>
): boolean {
  const node = unwrapArrayExpression(expression)

  if (node.type === "ArrayExpression") return true

  if (node.type === "CallExpression") {
    const method = arrayMethodTarget(node.callee)

    return (
      method !== null
      && [
        "map",
        "filter",
        "flatMap",
        "slice",
        "concat",
        "toSorted",
        "toReversed",
        "toSpliced",
      ].includes(method.name)
      && isKnownArrayExpressionFrom(sourceCode, method.object, visited)
    )
  }

  if (node.type !== "Identifier") return false
  const variable = resolveArrayBinding(sourceCode, node)

  if (variable === null || visited.has(variable)) return false
  visited.add(variable)

  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) return false

  for (const identifier of variable.identifiers) {
    const annotation = identifier.typeAnnotation?.typeAnnotation

    if (annotation !== undefined) return isArrayAnnotation(annotation)
  }

  const initializer = constInitializer(variable)

  return initializer !== null && isKnownArrayExpressionFrom(sourceCode, initializer, visited)
}
