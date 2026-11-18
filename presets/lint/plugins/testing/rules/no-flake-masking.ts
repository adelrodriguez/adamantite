import type { ESTree, Rule } from "@oxlint/plugins"

import { staticKeyName } from "../../shared/ast.ts"

// The functions that register a test or a suite, by the name at the root of the call, such as `it`
// in `it.effect("loads", ...)` or `test` in `test.each([1])("loads %i", ...)`.
const testFunctions: ReadonlySet<string> = new Set(["describe", "it", "suite", "test"])

// The members of a test function that do not register a test: they return a new test function or
// set fixture values.
const builderMembers: ReadonlySet<string> = new Set(["each", "extend", "for", "override", "scoped"])

// The files that Vitest runs as benchmarks by default, such as `index.bench.ts`.
const benchmarkFile = /\.(?:bench|benchmark)\.[cm]?[jt]sx?$/u

// The option key of a test or a suite that raises its timeout.
const testTimeouts: ReadonlySet<string> = new Set(["timeout"])

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

function isTestCall(callee: ESTree.Node): boolean {
  const root = rootName(callee)

  if (root === null || !testFunctions.has(root)) {
    return false
  }

  if (callee.type !== "MemberExpression") {
    return true
  }

  const member = staticKeyName(callee.property, callee.computed)

  return member === null || !builderMembers.has(member)
}

function isFunction(node: ESTree.Node): boolean {
  return node.type === "ArrowFunctionExpression" || node.type === "FunctionExpression"
}

/**
 * Ban test retries and raised test timeouts, which hide a flaky or slow test instead of fixing it.
 */
const rule: Rule = {
  createOnce(context) {
    // The local names of `flakyTest` that the file imports from @effect/vitest.
    const flakyTestNames = new Set<string>()

    function reportOptions(node: ESTree.Node | undefined, timeoutKeys: ReadonlySet<string>) {
      if (node?.type !== "ObjectExpression") {
        return
      }

      for (const property of node.properties) {
        const key = propertyName(property)

        if (key === "retry") {
          context.report({ messageId: "retry", node: property })
        } else if (key !== null && timeoutKeys.has(key)) {
          context.report({ messageId: "timeout", node: property })
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

        if (!isTestCall(callee)) {
          return
        }

        const [, second, third] = node.arguments

        reportOptions(second, testTimeouts)
        reportOptions(third, testTimeouts)

        // `test(name, fn, 60_000)` passes the timeout as a bare value after the test function.
        if (
          third !== undefined
          && second?.type !== "ObjectExpression"
          && third.type !== "ObjectExpression"
          && !isFunction(third)
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
        if (propertyName(node) !== "test" || node.value.type !== "ObjectExpression") {
          return
        }

        for (const property of node.value.properties) {
          if (propertyName(property) === "retry") {
            context.report({ messageId: "retry", node: property })
          }
        }
      },
      // A benchmark is slow by design, so its timeout hides no flaky test.
      before() {
        flakyTestNames.clear()

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
