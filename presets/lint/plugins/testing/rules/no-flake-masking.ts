import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { isNumberLiteral, staticKeyName, staticString } from "../../shared/ast.ts"
import { constBinding, resolveVariable } from "../../shared/scope.ts"

// The functions that register a test or a suite, by the name at the root of the call, such as `it`
// in `it.effect("loads", ...)` or `test` in `test.each([1])("loads %i", ...)`.
const testFunctions: ReadonlySet<string> = new Set(["describe", "it", "suite", "test"])

// The members of a test function that do not register a test: they return a new test function or
// set fixture values.
const builderMembers: ReadonlySet<string> = new Set(["each", "extend", "for", "override"])

// The member that sets fixture values in Vitest, as `test.scoped({ ... })`, and registers a test in
// @effect/vitest 3, as `it.scoped("loads", ...)`.
const scopedMember = "scoped"

// The Vite and Vitest configs, whose `test` options set the retries of every test.
const configFile = /(?:^|\/)(?:vite|vitest)\.config\.[cm]?[jt]s$/u

// The files that Vitest runs as benchmarks by default, such as `index.bench.ts`.
const benchmarkFile = /\.(?:bench|benchmark)\.[cm]?[jt]sx?$/u

// The option key of a test or a suite that raises its timeout.
const testTimeouts: ReadonlySet<string> = new Set(["timeout"])

// A Vitest config sets its timeouts on purpose, so only its retries count.
const noTimeouts: ReadonlySet<string> = new Set()

// The option keys of `vi.setConfig` that raise the timeout of every later test or hook.
const configTimeouts: ReadonlySet<string> = new Set(["hookTimeout", "testTimeout"])

// The calls that change the retries or the timeout of every later test, by object and method.
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

/**
 * Return the identifier at the root of a call target, such as `it` in `it.effect` or `test` in
 * `test.each([1])`.
 */
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

/**
 * Return the object and the method of a call such as `vi.setConfig(...)`, or null when the target
 * is not a member of an identifier.
 */
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

/**
 * Return the value that a `const` binding of an identifier holds, or the node itself for any other
 * expression.
 */
function constValue(sourceCode: SourceCode, node: ESTree.Node): ESTree.Node {
  if (node.type !== "Identifier") {
    return node
  }

  const variable = resolveVariable(sourceCode, node)
  const binding = variable === null ? null : constBinding(variable)

  return binding?.id.type === "Identifier" ? binding.init : node
}

/**
 * Reports whether an expression is a function, also through a function declaration or a `const`
 * binding, such as `body` in `function body() {}`.
 */
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

/**
 * Reports whether an expression computes a number from number literals, such as `2 * 60_000`, also
 * through a `const` binding.
 */
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

/**
 * Ban test retries and raised test timeouts, which hide a flaky or slow test instead of fixing it.
 */
const rule: Rule = {
  createOnce(context) {
    // The local names of `flakyTest` that the file imports from @effect/vitest.
    const flakyTestNames = new Set<string>()
    let isConfig = false
    // The options that a `const` binding holds can reach several calls, so each option gets one
    // report.
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
      // A benchmark is slow by design, so its timeout hides no flaky test.
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
