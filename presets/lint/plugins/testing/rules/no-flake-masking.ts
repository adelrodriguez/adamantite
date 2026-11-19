import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { isNumberLiteral, staticKeyName, staticString, unwrapExpression } from "../../shared/ast.ts"
import { constBinding, resolveVariable } from "../../shared/scope.ts"

const testFunctions: ReadonlySet<string> = new Set(["describe", "it", "suite", "test"])

// These members of a test function return a new test function or set fixture values, and
// register no test.
const builderMembers: ReadonlySet<string> = new Set(["each", "extend", "for", "override"])

// The member that sets fixture values in Vitest, as `test.scoped({ ... })`, and registers a test in
// @effect/vitest 3, as `it.scoped("loads", ...)`.
const scopedMember = "scoped"

const configFile = /(?:^|\/)(?:vite|vitest)\.config\.[cm]?[jt]s$/u

// The files that Vitest runs as benchmarks by default, such as `index.bench.ts`.
const benchmarkFile = /\.(?:bench|benchmark)\.[cm]?[jt]sx?$/u

const testTimeouts: ReadonlySet<string> = new Set(["timeout"])

const noTimeouts: ReadonlySet<string> = new Set()

const configTimeouts: ReadonlySet<string> = new Set(["hookTimeout", "testTimeout"])

const frameworkCalls: ReadonlyMap<string, ReadonlyMap<string, "retry" | "timeout">> = new Map([
  [
    "jest",
    new Map([
      ["retryTimes", "retry"],
      ["setTimeout", "timeout"],
    ] as const),
  ],
])

function propertyName(property: ESTree.Node): string | null {
  return property.type === "Property" ? staticKeyName(property.key, property.computed) : null
}

function rootName(node: ESTree.Node): string | null {
  if (node.type === "MemberExpression") {
    return rootName(node.object)
  }

  if (node.type === "CallExpression") {
    return rootName(node.callee)
  }

  if (node.type === "TaggedTemplateExpression") {
    return rootName(node.tag)
  }

  return node.type === "Identifier" ? node.name : null
}

function methodCall(callee: ESTree.Node): { method: string; object: string } | null {
  if (callee.type !== "MemberExpression" || callee.object.type !== "Identifier") {
    return null
  }

  const method = staticKeyName(callee.property, callee.computed)

  return method === null ? null : { method, object: callee.object.name }
}

function isTestCall(node: ESTree.CallExpression): boolean {
  const { callee } = node
  const root = rootName(callee)

  if (root === null || !testFunctions.has(root)) {
    return false
  }

  if (callee.type !== "MemberExpression") {
    return true
  }

  const member = staticKeyName(callee.property, callee.computed)
  const [name] = node.arguments

  if (member === scopedMember) {
    return name !== undefined && name.type !== "SpreadElement" && staticString(name) !== null
  }

  return member === null || !builderMembers.has(member)
}

function constValue(sourceCode: SourceCode, expression: ESTree.Node): ESTree.Node {
  const node = unwrapExpression(expression)

  if (node.type !== "Identifier") {
    return node
  }

  const variable = resolveVariable(sourceCode, node)
  const binding = variable === null ? null : constBinding(variable)

  return binding?.id.type === "Identifier" ? unwrapExpression(binding.init) : node
}

function isFunctionValue(sourceCode: SourceCode, node: ESTree.Node): boolean {
  if (node.type === "Identifier") {
    const variable = resolveVariable(sourceCode, node)

    if (variable?.defs.some((definition) => definition.type === "FunctionName")) {
      return true
    }
  }

  const value = constValue(sourceCode, node)

  return value.type === "ArrowFunctionExpression" || value.type === "FunctionExpression"
}

function isNumberValue(sourceCode: SourceCode, node: ESTree.Node, depth = 0): boolean {
  const value = depth > 8 ? node : constValue(sourceCode, node)

  if (isNumberLiteral(value)) {
    return true
  }

  if (value.type === "UnaryExpression") {
    return isNumberValue(sourceCode, value.argument, depth + 1)
  }

  return (
    value.type === "BinaryExpression"
    && value.left.type !== "PrivateIdentifier"
    && isNumberValue(sourceCode, value.left, depth + 1)
    && isNumberValue(sourceCode, value.right, depth + 1)
  )
}

const rule: Rule = {
  createOnce(context) {
    const flakyTestNames = new Set<string>()
    let isConfig = false
    const reported = new Set<ESTree.Node>()

    function report(messageId: "retry" | "timeout", property: ESTree.Node) {
      if (!reported.has(property)) {
        reported.add(property)
        context.report({ messageId, node: property })
      }
    }

    function reportOptions(node: ESTree.Node | undefined, timeoutKeys: ReadonlySet<string>) {
      if (node === undefined) {
        return
      }

      const options = constValue(context.sourceCode, node)

      if (options.type !== "ObjectExpression") {
        return
      }

      for (const property of options.properties) {
        const key = propertyName(property)

        if (key === "retry") {
          report("retry", property)
        } else if (key !== null && timeoutKeys.has(key)) {
          report("timeout", property)
        }
      }
    }

    return {
      CallExpression(node) {
        const { callee } = node
        const call = methodCall(callee)

        if (call?.object === "vi" && call.method === "setConfig") {
          reportOptions(node.arguments[0], configTimeouts)

          return
        }

        const frameworkCall = call && frameworkCalls.get(call.object)?.get(call.method)

        if (frameworkCall) {
          context.report({ messageId: frameworkCall, node })

          return
        }

        if (
          (call?.object === "it" && call.method === "flakyTest")
          || (callee.type === "Identifier" && flakyTestNames.has(callee.name))
        ) {
          context.report({ messageId: "flakyTest", node })

          return
        }

        if (!isTestCall(node)) {
          return
        }

        const [, second, third] = node.arguments

        reportOptions(second, testTimeouts)
        reportOptions(third, testTimeouts)

        if (
          second === undefined
          || third === undefined
          || second.type === "SpreadElement"
          || third.type === "SpreadElement"
          || constValue(context.sourceCode, third).type === "ObjectExpression"
          || isFunctionValue(context.sourceCode, third)
        ) {
          return
        }

        // `test(name, fn, 60_000)` passes the timeout as a bare value after the test function, and
        // `test(name, options, body)` passes the test function last. A third argument is a timeout
        // when the second is the test function or when it computes a number.
        if (
          isFunctionValue(context.sourceCode, second)
          || isNumberValue(context.sourceCode, third)
        ) {
          context.report({ messageId: "timeout", node: third })
        }
      },
      ImportDeclaration(node) {
        if (node.source.value !== "@effect/vitest") {
          return
        }

        for (const specifier of node.specifiers) {
          if (
            specifier.type === "ImportSpecifier"
            && staticKeyName(specifier.imported, false) === "flakyTest"
          ) {
            flakyTestNames.add(specifier.local.name)
          }
        }
      },
      // A Vitest config sets the retries of every test in its `test` options, also in a project.
      Property(node) {
        if (isConfig && propertyName(node) === "test") {
          reportOptions(node.value, noTimeouts)
        }
      },
      before() {
        flakyTestNames.clear()
        reported.clear()
        isConfig = configFile.test(context.filename.replaceAll("\\", "/"))

        return !benchmarkFile.test(context.filename)
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow test retries and raised test timeouts, which hide a flaky or slow test instead of fixing it.",
    },
    messages: {
      flakyTest:
        "`flakyTest` runs the effect again until it passes, which hides a flaky test. Find the event that the test waits for and await it, or control time with `TestClock`.",
      retry:
        "A test that passes on a retry is flaky. Remove the retry, find the event that the test waits for, and await that event.",
      timeout:
        "A raised timeout hides a slow or stuck test. Await the event that the test depends on, control time with `TestClock` or fake timers, or move slow shared setup into a `beforeAll` hook.",
    },
    type: "problem",
  },
}

export default rule
