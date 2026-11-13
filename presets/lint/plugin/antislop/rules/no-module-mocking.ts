import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { staticKeyName } from "../shared/literals.ts"
import {
  isGlobalObject,
  matchesThroughAliases,
  readsProperty,
  resolveVariable,
} from "../shared/scope.ts"

const moduleMockMethods = new Set(["doMock", "mock", "unstable_mockModule"])

/**
 * The test framework object that each test package exports. Vitest and Jest also make the object a
 * global.
 */
const frameworkExports = new Map([
  ["@jest/globals", "jest"],
  ["vitest", "vi"],
])

/**
 * Return the package and the export name that an identifier imports, with `*` for a namespace
 * import, or null when the identifier is not an import.
 */
function importedBinding(sourceCode: SourceCode, expression: ESTree.Node) {
  if (expression.type !== "Identifier") return null
  const definition = resolveVariable(sourceCode, expression)?.defs[0]

  if (definition?.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") {
    return null
  }

  const { node } = definition
  const source = definition.parent.source.value

  if (node.type === "ImportNamespaceSpecifier") return { name: "*", source }

  if (node.type !== "ImportSpecifier") return null
  const name = staticKeyName(node.imported, false)

  return name === null ? null : { name, source }
}

/**
 * Reports whether an expression reads the test framework object: the `vi` or `jest` global, such as
 * `vi` or `globalThis.vi`, an import of it, or a property of a namespace import, such as
 * `vitest.vi`.
 */
function isTestFrameworkObject(sourceCode: SourceCode, expression: ESTree.Node) {
  if ([...frameworkExports.values()].some((name) => isGlobalObject(sourceCode, expression, name))) {
    return true
  }

  const imported = importedBinding(sourceCode, expression)

  if (imported !== null) return frameworkExports.get(imported.source) === imported.name

  if (expression.type !== "MemberExpression") return false
  const namespace = importedBinding(sourceCode, expression.object)

  return (
    namespace?.name === "*"
    && frameworkExports.get(namespace.source)
      === staticKeyName(expression.property, expression.computed)
  )
}

/**
 * Reports whether a call target reads a module mock method of the test framework object, such as
 * `vi.mock`, `vitest.vi.mock`, or `doMock` after `const { doMock } = vi`.
 */
function isModuleMockMethod(sourceCode: SourceCode, callee: ESTree.Node) {
  return readsProperty(
    sourceCode,
    callee,
    (name) => moduleMockMethods.has(name),
    (owner) =>
      matchesThroughAliases(sourceCode, owner, (node) => isTestFrameworkObject(sourceCode, node))
  )
}

/**
 * Ban test framework module mocking in favor of real dependency seams.
 */
const rule: Rule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        if (isModuleMockMethod(context.sourceCode, node.callee)) {
          context.report({ messageId: "moduleMock", node })
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow Vitest and Jest module mocking; tests must replace dependencies through real interfaces.",
    },
    messages: {
      moduleMock:
        "Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation.",
    },
    type: "problem",
  },
}

export default rule
