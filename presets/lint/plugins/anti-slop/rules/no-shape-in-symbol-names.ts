import type { ESTree, Rule } from "@oxlint/plugins"

const FORBIDDEN_SYMBOL_NAME = "shape"

// An import binding takes its name from another module, so the rule checks only an import that
// the file renames. An implicit global has no declaration in the file.
const borrowedDefinitionTypes: ReadonlySet<string> = new Set([
  "ImplicitGlobalVariable",
  "ImportBinding",
])

type DeclaredName = ESTree.Node & { readonly name: string }

type Member =
  | ESTree.AccessorProperty
  | ESTree.MethodDefinition
  | ESTree.PropertyDefinition
  | ESTree.TSMethodSignature
  | ESTree.TSPropertySignature

function containsForbiddenSymbolName(name: string): boolean {
  return name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME)
}

function moduleExportName(name: ESTree.ModuleExportName): string {
  return name.type === "Literal" ? name.value : name.name
}

/**
 * Ban the case-insensitive substring "shape" in every name that a file declares.
 */
const rule: Rule = {
  createOnce(context) {
    const report = (node: DeclaredName) => {
      if (!containsForbiddenSymbolName(node.name)) return
      context.report({
        data: { name: node.name },
        messageId: "forbiddenSymbolName",
        node,
      })
    }

    const reportMemberKey = ({ computed, key }: Member) => {
      if (!computed && (key.type === "Identifier" || key.type === "PrivateIdentifier")) report(key)
    }

    return {
      AccessorProperty: reportMemberKey,
      ExportSpecifier(node) {
        if (moduleExportName(node.local) === moduleExportName(node.exported)) return

        if (node.exported.type !== "Literal") report(node.exported)
      },
      ImportDefaultSpecifier(node) {
        report(node.local)
      },
      ImportNamespaceSpecifier(node) {
        report(node.local)
      },
      ImportSpecifier(node) {
        if (moduleExportName(node.imported) !== node.local.name) report(node.local)
      },
      MethodDefinition: reportMemberKey,
      "Program:exit"() {
        // A class name is a variable in two scopes, so report each declared name once.
        const declaredNames = new Set<DeclaredName>()

        for (const scope of context.sourceCode.scopeManager.scopes) {
          for (const variable of scope.variables) {
            for (const definition of variable.defs) {
              if (!borrowedDefinitionTypes.has(definition.type)) {
                declaredNames.add(definition.name)
              }
            }
          }
        }

        for (const name of declaredNames) report(name)
      },
      PropertyDefinition: reportMemberKey,
      TSAbstractAccessorProperty: reportMemberKey,
      TSAbstractMethodDefinition: reportMemberKey,
      TSAbstractPropertyDefinition: reportMemberKey,
      TSMethodSignature: reportMemberKey,
      TSPropertySignature: reportMemberKey,
    }
  },
  meta: {
    docs: {
      description:
        'Disallow the case-insensitive substring "shape" in the names that a file declares, such as bindings, types, and members.',
    },
    messages: {
      forbiddenSymbolName:
        'Rename symbol "{{name}}" for its domain role; "shape" describes structure rather than ownership.',
    },
    type: "problem",
  },
}

export default rule
