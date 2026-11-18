import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { staticKeyName } from "../../shared/ast.ts"
import {
  constBinding,
  isGlobalObject,
  matchesThroughAliases,
  readsProperty,
  resolveVariable,
} from "../../shared/scope.ts"

// The methods of the test framework object that replace a module, or build a module or an object
// of mocks in place of the real one.
const moduleMockMethods: ReadonlySet<string> = new Set([
  "createMockFromModule",
  "doMock",
  "enableAutomock",
  "genMockFromModule",
  "importMock",
  "mock",
  "mockObject",
  "setMock",
  "unstable_mockModule",
])

// The methods of the test framework object that replace a global or a property with a value of the
// test, or what a spy returns for some arguments, as `vi.when(spy).calledWith(1).thenReturn(2)`.
const replacementMethods: ReadonlySet<string> = new Set(["replaceProperty", "stubGlobal", "when"])

// The methods of a mock or a spy that replace what the function does. A spy without them only
// observes the real function.
const behaviorMethods: ReadonlySet<string> = new Set([
  "mockImplementation",
  "mockImplementationOnce",
  "mockRejectedValue",
  "mockRejectedValueOnce",
  "mockResolvedValue",
  "mockResolvedValueOnce",
  "mockReturnThis",
  "mockReturnValue",
  "mockReturnValueOnce",
])

// A mock method with a common name, which other objects also have. It counts only on a mock or a
// spy that the test framework builds, as `vi.fn().withImplementation(...)`.
const sharedBehaviorMethod = "withImplementation"

// The methods of the test framework object that build or type a mock or a spy.
const mockBuilders: ReadonlySet<string> = new Set(["fn", "mocked", "spyOn"])

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
  if (expression.type !== "Identifier") {
    return null
  }

  const definition = resolveVariable(sourceCode, expression)?.defs[0]

  if (definition?.type !== "ImportBinding" || definition.parent?.type !== "ImportDeclaration") {
    return null
  }

  const { node } = definition
  const source = definition.parent.source.value

  if (node.type === "ImportNamespaceSpecifier") {
    return { name: "*", source }
  }

  if (node.type !== "ImportSpecifier") {
    return null
  }

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

  if (imported !== null) {
    return frameworkExports.get(imported.source) === imported.name
  }

  if (expression.type !== "MemberExpression") {
    return false
  }

  const namespace = importedBinding(sourceCode, expression.object)

  return (
    namespace?.name === "*"
    && frameworkExports.get(namespace.source)
      === staticKeyName(expression.property, expression.computed)
  )
}

/**
 * Reports whether a call target reads a method of the test framework object that `isName` accepts,
 * such as `vi.mock`, `vitest.vi.mock`, or `doMock` after `const { doMock } = vi`.
 */
function isFrameworkMethod(
  sourceCode: SourceCode,
  callee: ESTree.Node,
  isName: (name: string) => boolean
) {
  return readsProperty(sourceCode, callee, isName, (owner) =>
    matchesThroughAliases(sourceCode, owner, (node) => isTestFrameworkObject(sourceCode, node))
  )
}

/**
 * Reports whether a call passes a function its implementation, as `vi.fn(() => 1)` does. `vi.fn()`
 * and `vi.fn(undefined)` build a function that only records its calls.
 */
function passesImplementation(sourceCode: SourceCode, node: ESTree.CallExpression) {
  const [implementation] = node.arguments

  return (
    implementation !== undefined
    && !isGlobalObject(sourceCode, implementation, "undefined")
    && isFrameworkMethod(sourceCode, node.callee, (name) => name === "fn")
  )
}

/**
 * Reports whether an expression is a mock or a spy that the test framework builds, such as
 * `vi.fn()`, also through a `const` binding.
 */
function isFrameworkMock(sourceCode: SourceCode, node: ESTree.Node) {
  const variable = node.type === "Identifier" ? resolveVariable(sourceCode, node) : null
  const binding = variable === null ? null : constBinding(variable)
  const value = binding?.id.type === "Identifier" ? binding.init : node

  return (
    value.type === "CallExpression"
    && isFrameworkMethod(sourceCode, value.callee, (name) => mockBuilders.has(name))
  )
}

function isBehaviorMethod(sourceCode: SourceCode, callee: ESTree.Node) {
  if (callee.type !== "MemberExpression") {
    return false
  }

  const name = staticKeyName(callee.property, callee.computed)

  if (name === sharedBehaviorMethod) {
    return isFrameworkMock(sourceCode, callee.object)
  }

  return name !== null && behaviorMethods.has(name)
}

/**
 * Ban test doubles that replace what a dependency does: module mocks, mock implementations, and
 * stubbed globals. A spy that only observes the real function stays allowed.
 */
const rule: Rule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        const { sourceCode } = context

        if (isFrameworkMethod(sourceCode, node.callee, (name) => moduleMockMethods.has(name))) {
          context.report({ messageId: "moduleMock", node })
        } else if (
          isBehaviorMethod(sourceCode, node.callee)
          || passesImplementation(sourceCode, node)
          || isFrameworkMethod(sourceCode, node.callee, (name) => replacementMethods.has(name))
        ) {
          context.report({ messageId: "replacement", node })
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow Vitest and Jest test doubles that replace what a dependency does; tests replace a dependency through its interface.",
    },
    messages: {
      moduleMock:
        "Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation.",
      replacement:
        "Do not replace what a dependency does with a mock implementation or a stubbed global. Pass a test implementation through the dependency's interface, such as an Effect `Layer` or a function parameter. A spy may only observe the real function.",
    },
    type: "problem",
  },
}

export default rule
