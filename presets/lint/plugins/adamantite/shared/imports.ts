import type { Context, ESTree, Scope } from "@oxlint/plugins"
import type { ResolutionMode } from "./resolver.ts"
import { staticKeyName, staticString } from "../../shared/ast.ts"

export interface ModuleSource {
  readonly mode: ResolutionMode
  readonly node: ESTree.Node
  readonly specifier: string
}

export function readStaticSource(node: ESTree.StringLiteral): ModuleSource {
  return { mode: "import", node, specifier: node.value }
}

export function readDynamicSource(node: ESTree.ImportExpression): ModuleSource | undefined {
  const specifier = staticString(node.source)

  return specifier === null ? undefined : { mode: "import", node: node.source, specifier }
}

const TYPE_DECLARATIONS: ReadonlySet<string> = new Set([
  "TSInterfaceDeclaration",
  "TSTypeAliasDeclaration",
])

function declaresRequire(scope: Scope) {
  for (let current: Scope | null = scope; current !== null; current = current.upper) {
    const defs = current.set.get("require")?.defs ?? []

    if (defs.some((def) => !TYPE_DECLARATIONS.has(def.node.type))) {
      return true
    }
  }

  return false
}

export function readRequireSource(
  context: Context,
  node: ESTree.CallExpression
): ModuleSource | undefined {
  const [argument] = node.arguments

  if (
    node.callee.type !== "Identifier"
    || node.callee.name !== "require"
    || argument === undefined
    || argument.type === "SpreadElement"
    || declaresRequire(context.sourceCode.getScope(node))
  ) {
    return undefined
  }

  const specifier = staticString(argument)

  return specifier === null ? undefined : { mode: "require", node: argument, specifier }
}

export function readImportEqualsSource(
  node: ESTree.TSImportEqualsDeclaration
): ModuleSource | undefined {
  const reference = node.moduleReference

  return reference.type === "TSExternalModuleReference"
    ? { mode: "require", node: reference.expression, specifier: reference.expression.value }
    : undefined
}

// A type alias or an interface named `require` leaves the runtime `require` in place.
export interface ImportedCall {
  readonly call: ESTree.CallExpression
  readonly name: string
}

function getImportedName(specifier: ESTree.ImportSpecifier) {
  return specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name
}

function getPropertyName(member: ESTree.MemberExpression) {
  return staticKeyName(member.property, member.computed) ?? undefined
}

function getCall(node: ESTree.Node) {
  const { parent } = node

  return parent?.type === "CallExpression" && parent.callee === node ? parent : undefined
}

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
