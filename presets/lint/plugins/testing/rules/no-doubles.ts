import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { staticKeyName, unwrapExpression } from "../../shared/ast.ts"
import {
  constBinding,
  isGlobalObject,
  matchesThroughAliases,
  readsProperty,
  resolveVariable,
} from "../../shared/scope.ts"

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

const replacementMethods: ReadonlySet<string> = new Set(["replaceProperty", "stubGlobal", "when"])

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

const sharedBehaviorMethod = "withImplementation"

const mockBuilders: ReadonlySet<string> = new Set(["fn", "mocked", "spyOn"])

// Vitest and Jest also make these objects globals.
const frameworkExports = new Map([
  ["@jest/globals", "jest"],
  ["vitest", "vi"],
])

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

function isFrameworkMethod(
  sourceCode: SourceCode,
  callee: ESTree.Node,
  isName: (name: string) => boolean
) {
  return readsProperty(sourceCode, callee, isName, (owner) =>
    matchesThroughAliases(sourceCode, owner, (node) => isTestFrameworkObject(sourceCode, node))
  )
}

function passesImplementation(sourceCode: SourceCode, node: ESTree.CallExpression) {
  const [implementation] = node.arguments

  return (
    implementation !== undefined
    && !isGlobalObject(sourceCode, implementation, "undefined")
    && isFrameworkMethod(sourceCode, node.callee, (name) => name === "fn")
  )
}

function isFrameworkMock(sourceCode: SourceCode, expression: ESTree.Node) {
  const node = unwrapExpression(expression)
  const variable = node.type === "Identifier" ? resolveVariable(sourceCode, node) : null
  const binding = variable === null ? null : constBinding(variable)
  const value = binding?.id.type === "Identifier" ? unwrapExpression(binding.init) : node

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
