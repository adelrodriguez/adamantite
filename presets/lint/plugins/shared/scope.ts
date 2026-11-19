import type { ESTree, Scope, SourceCode, Variable } from "@oxlint/plugins"

import { staticKeyName } from "./ast.ts"

export function resolveVariable(
  sourceCode: SourceCode,
  identifier: ESTree.Node & { readonly name: string }
): Variable | null {
  let scope: Scope | null = sourceCode.getScope(identifier)

  while (scope !== null) {
    const variable = scope.set.get(identifier.name)

    if (variable !== undefined) {
      return variable
    }

    scope = scope.upper
  }

  return null
}

export function constBinding(
  variable: Variable
): { readonly id: ESTree.BindingPattern; readonly init: ESTree.Expression } | null {
  if (variable.references.some((reference) => reference.isWrite() && !reference.init)) {
    return null
  }

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

function isGlobalIdentifier(sourceCode: SourceCode, expression: ESTree.Node, name: string) {
  if (expression.type !== "Identifier" || expression.name !== name) {
    return false
  }

  if (sourceCode.isGlobalReference(expression)) {
    return true
  }

  const variable = resolveVariable(sourceCode, expression)

  return variable === null || variable.defs.length === 0
}

export function isGlobalObject(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  name: string
): boolean {
  if (isGlobalIdentifier(sourceCode, expression, name)) {
    return true
  }

  return (
    expression.type === "MemberExpression"
    && staticKeyName(expression.property, expression.computed) === name
    && isGlobalIdentifier(sourceCode, expression.object, "globalThis")
  )
}

function resolveConstBinding(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  visited: Set<Variable>
) {
  if (expression.type !== "Identifier") {
    return null
  }

  const variable = resolveVariable(sourceCode, expression)

  if (variable === null || visited.has(variable)) {
    return null
  }

  visited.add(variable)

  return constBinding(variable)
}

export function matchesThroughAliases(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  matches: (expression: ESTree.Node) => boolean
): boolean {
  return matchesThroughAliasesFrom(sourceCode, expression, matches, new Set())
}

function matchesThroughAliasesFrom(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  matches: (expression: ESTree.Node) => boolean,
  visited: Set<Variable>
): boolean {
  if (matches(expression)) {
    return true
  }

  const binding = resolveConstBinding(sourceCode, expression, visited)

  return (
    binding?.id.type === "Identifier"
    && matchesThroughAliasesFrom(sourceCode, binding.init, matches, visited)
  )
}

export function readsProperty(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  isName: (name: string) => boolean,
  isOwner: (expression: ESTree.Node) => boolean
): boolean {
  return readsPropertyFrom(sourceCode, expression, isName, isOwner, new Set())
}

function readsPropertyFrom(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  isName: (name: string) => boolean,
  isOwner: (expression: ESTree.Node) => boolean,
  visited: Set<Variable>
): boolean {
  if (expression.type === "MemberExpression") {
    const name = staticKeyName(expression.property, expression.computed)

    return name !== null && isName(name) && isOwner(expression.object)
  }

  const binding = resolveConstBinding(sourceCode, expression, visited)

  if (binding === null) {
    return false
  }

  const { id, init } = binding

  if (id.type === "Identifier") {
    return readsPropertyFrom(sourceCode, init, isName, isOwner, visited)
  }

  return (
    id.type === "ObjectPattern"
    && expression.type === "Identifier"
    && id.properties.some((property) => {
      if (property.type !== "Property" || property.value.type !== "Identifier") {
        return false
      }

      const name = staticKeyName(property.key, property.computed)

      return property.value.name === expression.name && name !== null && isName(name)
    })
    && isOwner(init)
  )
}
