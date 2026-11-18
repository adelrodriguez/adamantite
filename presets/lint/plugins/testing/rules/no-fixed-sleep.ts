import type { ESTree, Rule } from "@oxlint/plugins"

import { staticKeyName } from "../../shared/ast.ts"

// The functions whose callback is a test or a hook, by the name at the root of the call, such as
// `it` in `it.effect("loads", ...)` or `test` in `test.each([1])("loads %i", ...)`.
const testCallees: ReadonlySet<string> = new Set([
  "afterAll",
  "afterEach",
  "beforeAll",
  "beforeEach",
  "it",
  "test",
])

// The modules whose `setTimeout` returns a promise that resolves after the delay.
const timerModules: ReadonlySet<string> = new Set(["node:timers/promises", "timers/promises"])

// The objects whose `useFakeTimers` method replaces the real timers.
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

/**
 * Return the outermost `.pipe(...)` call that starts from an effect, such as the whole of
 * `Effect.gen(...).pipe(Effect.provide(layer))`, or the effect itself when no pipe follows it.
 */
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

/**
 * Reports whether a generator is the body of an Effect test, as in `it.effect("loads", () =>
 * Effect.gen(function* () { ... }))`: the test callback returns the `Effect.gen` call of the
 * generator, also through `.pipe(...)`.
 */
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

/**
 * Reports whether a node runs in the body of a test or a hook, not in a helper or a handler that
 * the body passes on.
 */
function inTestBody(node: ESTree.Node): boolean {
  const fn = enclosingFunction(node)

  return fn !== null && (isTestCallback(fn) || isEffectTestBody(fn))
}

/**
 * Return the single expression that a function body runs, such as `setTimeout(resolve, 10)` in
 * `(resolve) => { setTimeout(resolve, 10) }`, or null when the body runs more than one statement.
 */
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

/**
 * Reports whether a promise only resolves after a delay, as in `new Promise((resolve) =>
 * setTimeout(resolve, 10))`.
 */
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

/**
 * Ban a fixed real-time sleep in the body of a test or a hook, which guesses how long the work
 * takes.
 */
const rule: Rule = {
  createOnce(context) {
    // The local names of `setTimeout` that the file imports from a timer module.
    const timers = new Set<string>()
    // The local names of a timer module that the file imports whole, such as `timers` in
    // `import timers from "node:timers/promises"`.
    const timerModuleNames = new Set<string>()
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
        if (!timerModules.has(node.source.value)) {
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
        if (node.object.type === "Identifier" && node.object.name === "TestClock") {
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
