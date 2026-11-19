import type { ESTree, Rule } from "@oxlint/plugins"

import { staticKeyName } from "../../shared/ast.ts"
import { resolveVariable } from "../../shared/scope.ts"

const testCallees: ReadonlySet<string> = new Set([
  "afterAll",
  "afterEach",
  "beforeAll",
  "beforeEach",
  "it",
  "test",
])

// The `setTimeout` of these modules returns a promise that resolves after the delay.
const timerModules: ReadonlySet<string> = new Set(["node:timers/promises", "timers/promises"])

// The `useFakeTimers` method of these objects replaces the real timers.
const fakeTimerObjects: ReadonlySet<string> = new Set(["jest", "vi"])

type FunctionNode = ESTree.ArrowFunctionExpression | ESTree.Function

function isFunctionNode(node: ESTree.Node): node is FunctionNode {
  return (
    node.type === "ArrowFunctionExpression"
    || node.type === "FunctionDeclaration"
    || node.type === "FunctionExpression"
  )
}

function isMember(node: ESTree.Node, object: string, property: string): boolean {
  return (
    node.type === "MemberExpression"
    && node.object.type === "Identifier"
    && node.object.name === object
    && staticKeyName(node.property, node.computed) === property
  )
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

function enclosingFunction(node: ESTree.Node): FunctionNode | null {
  let current: ESTree.Node | null = node.parent

  while (current) {
    if (isFunctionNode(current)) {
      return current
    }

    current = current.parent
  }

  return null
}

function isTestCallback(fn: FunctionNode): boolean {
  const call = fn.parent

  return (
    call.type === "CallExpression"
    && call.arguments.some((argument) => argument === fn)
    && testCallees.has(rootName(call.callee) ?? "")
  )
}

function pipedEffect(effect: ESTree.CallExpression): ESTree.CallExpression {
  let current = effect

  for (;;) {
    const member = current.parent

    if (
      member.type !== "MemberExpression"
      || member.object !== current
      || staticKeyName(member.property, member.computed) !== "pipe"
      || member.parent.type !== "CallExpression"
      || member.parent.callee !== member
    ) {
      return current
    }

    current = member.parent
  }
}

function isEffectTestBody(fn: FunctionNode): boolean {
  const gen = fn.parent

  if (!fn.generator || gen.type !== "CallExpression" || !isMember(gen.callee, "Effect", "gen")) {
    return false
  }

  const body = pipedEffect(gen)

  const owner =
    body.parent.type === "ReturnStatement" ? enclosingFunction(body.parent) : body.parent

  return owner !== null && isFunctionNode(owner) && isTestCallback(owner)
}

function inTestBody(node: ESTree.Node): boolean {
  const fn = enclosingFunction(node)

  return fn !== null && (isTestCallback(fn) || isEffectTestBody(fn))
}

function onlyExpression(body: ESTree.Node | null): ESTree.Node | null {
  if (body?.type !== "BlockStatement") {
    return body
  }

  const [statement, ...rest] = body.body

  return statement?.type === "ExpressionStatement" && rest.length === 0
    ? statement.expression
    : null
}

function isSetTimeout(node: ESTree.Node): boolean {
  return (
    (node.type === "Identifier" && node.name === "setTimeout")
    || isMember(node, "globalThis", "setTimeout")
    || isMember(node, "window", "setTimeout")
  )
}

function resolvesAfterTimeout(node: ESTree.NewExpression): boolean {
  const [executor] = node.arguments

  if (executor?.type !== "ArrowFunctionExpression" && executor?.type !== "FunctionExpression") {
    return false
  }

  const [resolve] = executor.params

  if (resolve?.type !== "Identifier") {
    return false
  }

  const call = onlyExpression(executor.body)

  if (call?.type !== "CallExpression" || !isSetTimeout(call.callee)) {
    return false
  }

  const [handler] = call.arguments

  if (handler?.type === "Identifier") {
    return handler.name === resolve.name
  }

  return (
    handler?.type === "ArrowFunctionExpression"
    && handler.body.type === "CallExpression"
    && handler.body.callee.type === "Identifier"
    && handler.body.callee.name === resolve.name
  )
}

const rule: Rule = {
  createOnce(context) {
    const timers = new Set<string>()
    const timerModuleNames = new Set<string>()
    const testClockNames = new Set<string>()
    const sleeps: ESTree.Node[] = []
    let fakeTime = false

    function isSleep(node: ESTree.Node): boolean {
      if (node.type === "NewExpression") {
        return (
          node.callee.type === "Identifier"
          && node.callee.name === "Promise"
          && resolvesAfterTimeout(node)
        )
      }

      if (node.type !== "CallExpression") {
        return false
      }

      const { callee } = node

      return (
        (callee.type === "Identifier" && timers.has(callee.name))
        || [...timerModuleNames].some((name) => isMember(callee, name, "setTimeout"))
        || isMember(callee, "scheduler", "wait")
        || isMember(callee, "Bun", "sleep")
      )
    }

    return {
      // `it("waits", () => delay(100))` returns the sleep, and the runner awaits it.
      ArrowFunctionExpression(node) {
        if (node.expression && isSleep(node.body) && isTestCallback(node)) {
          sleeps.push(node.body)
        }
      },
      AwaitExpression(node) {
        if (isSleep(node.argument) && inTestBody(node)) {
          sleeps.push(node)
        }
      },
      CallExpression(node) {
        const { callee } = node

        if (
          callee.type === "MemberExpression"
          && callee.object.type === "Identifier"
          && fakeTimerObjects.has(callee.object.name)
          && staticKeyName(callee.property, callee.computed) === "useFakeTimers"
        ) {
          fakeTime = true
        }
      },
      ImportDeclaration(node) {
        const source = node.source.value

        if (source === "effect" || source.startsWith("effect/")) {
          for (const specifier of node.specifiers) {
            if (
              specifier.type === "ImportSpecifier"
                ? staticKeyName(specifier.imported, false) === "TestClock"
                : source.endsWith("/TestClock")
            ) {
              testClockNames.add(specifier.local.name)
            }
          }
        }

        if (!timerModules.has(source)) {
          return
        }

        for (const specifier of node.specifiers) {
          if (specifier.type !== "ImportSpecifier") {
            timerModuleNames.add(specifier.local.name)
          } else if (staticKeyName(specifier.imported, false) === "setTimeout") {
            timers.add(specifier.local.name)
          }
        }
      },
      // `TestClock` moves the time of an Effect test, as fake timers do.
      MemberExpression(node) {
        const { object } = node

        if (
          object.type === "Identifier"
          && testClockNames.has(object.name)
          && resolveVariable(context.sourceCode, object)?.defs[0]?.type === "ImportBinding"
        ) {
          fakeTime = true
        }
      },
      "Program:exit"() {
        if (fakeTime) {
          return
        }

        for (const node of sleeps) {
          context.report({ messageId: "sleep", node })
        }
      },
      ReturnStatement(node) {
        if (node.argument && isSleep(node.argument) && inTestBody(node)) {
          sleeps.push(node.argument)
        }
      },
      YieldExpression(node) {
        const { argument } = node

        if (
          node.delegate
          && argument?.type === "CallExpression"
          && isMember(argument.callee, "Effect", "sleep")
          && inTestBody(node)
        ) {
          sleeps.push(node)
        }
      },
      before() {
        timers.clear()
        timerModuleNames.clear()
        testClockNames.clear()
        sleeps.length = 0
        fakeTime = false
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow a fixed real-time sleep in the body of a test or a hook; await the event that the test depends on.",
    },
    messages: {
      sleep:
        "A fixed sleep guesses how long the work takes, and fails under load. Await the operation, or a promise that its handler resolves. To move time, use fake timers or `TestClock`.",
    },
    type: "problem",
  },
}

export default rule
