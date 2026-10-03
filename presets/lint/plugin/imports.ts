import type { Context, ESTree } from "@oxlint/plugins"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs and imports only types from packages.

/**
 * A call of a module export, such as `useState(0)` or `React.useState(0)`.
 */
export interface ImportedCall {
  readonly call: ESTree.CallExpression
  /**
   * The export name, which stays the same when the import is aliased.
   */
  readonly name: string
}

function getImportedName(specifier: ESTree.ImportSpecifier) {
  return specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name
}

function isStringLiteral(node: ESTree.Expression): node is ESTree.StringLiteral {
  return node.type === "Literal" && typeof node.value === "string"
}

function getPropertyName(member: ESTree.MemberExpression) {
  if (!member.computed) {
    return member.property.type === "Identifier" ? member.property.name : undefined
  }

  return isStringLiteral(member.property) ? member.property.value : undefined
}

function getCall(node: ESTree.Node) {
  const { parent } = node

  return parent?.type === "CallExpression" && parent.callee === node ? parent : undefined
}

/**
 * Find the calls of the exports in `names` that `node` imports: direct calls through a named
 * import, including aliased ones, and member calls such as `React.useState(0)` through a default or
 * namespace import. Type-only imports give no calls.
 */
export function findImportedCalls(
  context: Context,
  node: ESTree.ImportDeclaration,
  names: ReadonlySet<string>
): ImportedCall[] {
  if (node.importKind === "type") {
    return []
  }

  const calls: ImportedCall[] = []

  for (const specifier of node.specifiers) {
    if (specifier.type === "ImportSpecifier" && specifier.importKind === "type") {
      continue
    }

    const identifiers = context.sourceCode
      .getDeclaredVariables(specifier)
      .flatMap((variable) => variable.references)
      .map((reference) => reference.identifier)

    if (specifier.type === "ImportSpecifier") {
      const name = getImportedName(specifier)

      if (!names.has(name)) {
        continue
      }

      for (const identifier of identifiers) {
        const call = getCall(identifier)

        if (call !== undefined) {
          calls.push({ call, name })
        }
      }

      continue
    }

    for (const identifier of identifiers) {
      const member = identifier.parent

      if (member.type !== "MemberExpression" || member.object !== identifier) {
        continue
      }

      const name = getPropertyName(member)
      const call = getCall(member)

      if (name !== undefined && names.has(name) && call !== undefined) {
        calls.push({ call, name })
      }
    }
  }

  return calls
}
