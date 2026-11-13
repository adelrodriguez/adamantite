import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins"

import { staticKeyName } from "./literals.ts"

/**
 * Resolve an identifier to its binding by walking lexical scopes upward.
 */
export function resolveVariable(
  sourceCode: SourceCode,
  identifier: ESTree.Node & { readonly name: string }
): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier)

  while (scope !== null) {
    const variable = scope.set.get(identifier.name)

    if (variable !== undefined) return variable
    scope = scope.upper
  }

  return null
}

/**
 * Return the pattern and the value of a `const` binding that no code reassigns, or null for any
 * other binding.
 */
export function constBinding(
  variable: Variable
): { readonly id: ESTree.BindingPattern; readonly init: ESTree.Expression } | null {
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) return null

  for (const definition of variable.defs) {
    if (
      definition.type === "Variable"
      && definition.node.type === "VariableDeclarator"
      && definition.node.init !== null
      && definition.node.parent.type === "VariableDeclaration"
      && definition.node.parent.kind === "const"
    ) {
      return { id: definition.node.id, init: definition.node.init }
    }
  }

  return null
}

/**
 * Reports whether an identifier with the given name reads a global, because the file does not
 * declare that name in scope.
 */
function isGlobalIdentifier(sourceCode: SourceCode, expression: ESTree.Node, name: string) {
  if (expression.type !== "Identifier" || expression.name !== name) return false

  if (sourceCode.isGlobalReference(expression)) return true
  const variable = resolveVariable(sourceCode, expression)

  return variable === null || variable.defs.length === 0
}

/**
 * Reports whether an expression reads a global object by name, such as `Reflect` or
 * `globalThis.Reflect`, and no local binding shadows it.
 */
export function isGlobalObject(sourceCode: SourceCode, expression: ESTree.Node, name: string) {
  if (isGlobalIdentifier(sourceCode, expression, name)) return true

  return (
    expression.type === "MemberExpression"
    && staticKeyName(expression.property, expression.computed) === name
    && isGlobalIdentifier(sourceCode, expression.object, "globalThis")
  )
}
