import type { Context, ESTree, Scope } from "@oxlint/plugins"
import type { ResolutionMode } from "./resolver.ts"
import { staticKeyName, staticString } from "../../shared/ast.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs and imports only types from packages.

/**
 * The module that an import names, such as `../high/api.ts` in ``import(`../high/api.ts`)``.
 */
export interface ModuleSource {
  /**
   * How the import loads the module: `require` for `require()` and `import x = require()`.
   */
  readonly mode: ResolutionMode
  /**
   * The source expression, where a report points.
   */
  readonly node: ESTree.Node
  /**
   * The specifier that the source spells.
   */
  readonly specifier: string
}

/**
 * Read the source of a static import or export, such as `"./api.ts"` in `export * from "./api.ts"`.
 */
export function readStaticSource(node: ESTree.StringLiteral): ModuleSource {
  return { mode: "import", node, specifier: node.value }
}

/**
 * Read the source of `import()` when the code spells it without computing it, as a string, a
 * template with no expression, or either inside type assertions. Return undefined for a source that
 * only running the code gives.
 */
export function readDynamicSource(node: ESTree.ImportExpression): ModuleSource | undefined {
  const specifier = staticString(node.source)

  return specifier === null ? undefined : { mode: "import", node: node.source, specifier }
}

function declaresRequire(scope: Scope) {
  for (let current: Scope | null = scope; current !== null; current = current.upper) {
    if ((current.set.get("require")?.defs.length ?? 0) > 0) {
      return true
    }
  }

  return false
}

/**
 * Read the source of a CommonJS `require()` call, such as `require("./api.ts")`, when the code
 * spells it without computing it. Return undefined for any other call, and for a call of a function
 * that the file declares as `require`.
 */
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

/**
 * Read the module of a TypeScript import-equals declaration, such as `"./api.ts"` in `import api =
 * require("./api.ts")`. Return undefined for an alias of a namespace, such as `import Base =
 * Integrations.Base`.
 */
export function readImportEqualsSource(
  node: ESTree.TSImportEqualsDeclaration
): ModuleSource | undefined {
  const reference = node.moduleReference

  return reference.type === "TSExternalModuleReference"
    ? { mode: "require", node: reference.expression, specifier: reference.expression.value }
    : undefined
}

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

function getPropertyName(member: ESTree.MemberExpression) {
  return staticKeyName(member.property, member.computed) ?? undefined
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
