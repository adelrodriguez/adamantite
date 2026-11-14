import type { ESTree, Rule, SourceCode, Variable } from "@oxlint/plugins"

import { isNumberLiteral, staticKeyName } from "../../shared/ast.ts"
import {
  arrayMethodTarget,
  constInitializer,
  isKnownArrayExpression,
  resolveArrayBinding,
  unwrapArrayExpression,
} from "../shared/array-method.ts"
import { isGlobalObject } from "../shared/scope.ts"

type ReducerCallback = ESTree.ArrowFunctionExpression | ESTree.Function

/**
 * Return the call that takes a node as an argument, past syntax-only wrappers, or null.
 */
function callWithArgument(node: ESTree.Node) {
  let owner: ESTree.Node | null = node.parent

  while (owner !== null && unwrapArrayExpression(owner) === node) owner = owner.parent

  return owner?.type === "CallExpression"
    && owner.arguments.some((argument) => unwrapArrayExpression(argument) === node)
    ? owner
    : null
}

/**
 * Return the reduce call that takes a node as its reducer, or null.
 */
function reduceCallWithReducer(node: ESTree.Node) {
  const call = callWithArgument(node)

  if (call === null) return null
  const method = arrayMethodTarget(call.callee)
  const [reducer] = call.arguments

  return (method?.name === "reduce" || method?.name === "reduceRight")
    && call.arguments.length <= 2
    && reducer !== undefined
    && unwrapArrayExpression(reducer) === node
    ? call
    : null
}

/**
 * Return the binding that names a function, for a function declaration or a function that
 * initializes a `const` binding that no code reassigns. Return null for any other function.
 */
function functionBinding(sourceCode: SourceCode, callback: ReducerCallback) {
  if (callback.type === "FunctionDeclaration") {
    const variable = sourceCode
      .getDeclaredVariables(callback)
      .find((declared) => declared.defs.some((definition) => definition.type === "FunctionName"))

    return variable?.references.some((reference) => reference.isWrite()) === false ? variable : null
  }

  let declarator: ESTree.Node | null = callback.parent

  while (declarator !== null && unwrapArrayExpression(declarator) === callback) {
    declarator = declarator.parent
  }

  if (declarator?.type !== "VariableDeclarator") return null
  const [variable] = sourceCode.getDeclaredVariables(declarator)

  return variable !== undefined && constInitializer(variable) === declarator.init ? variable : null
}

/**
 * Return the reduce call that uses a function as its reducer: inline, or by the name of a function
 * declaration or a `const` binding in the same file. Return null when no reduce call uses it.
 */
function reduceCallForCallback(sourceCode: SourceCode, callback: ReducerCallback) {
  const inlineCall = reduceCallWithReducer(callback)

  if (inlineCall !== null) return inlineCall
  const variable = functionBinding(sourceCode, callback)

  for (const reference of variable?.references ?? []) {
    const call = reduceCallWithReducer(reference.identifier)

    if (call !== null) return call
  }

  return null
}

/**
 * Return the accumulator parameter and the initial value of a reducer, or null when the accumulator
 * is not a plain name.
 */
function reducerParts(callback: ReducerCallback, call: ESTree.CallExpression) {
  const firstParameter = callback.params[0]

  const accumulator =
    firstParameter?.type === "AssignmentPattern" ? firstParameter.left : firstParameter

  if (accumulator?.type !== "Identifier") return null

  return { accumulator, callback, initialValue: call.arguments[1] }
}

/**
 * Find the reducer that runs a node. A callback inside the reducer, such as a `forEach` callback,
 * runs on each step, so the search continues past it. Any other function, such as a stored
 * callback, stops the search.
 */
function enclosingReducer(sourceCode: SourceCode, node: ESTree.Node) {
  let parent = node.parent

  while (parent !== null) {
    if (
      parent.type === "ArrowFunctionExpression"
      || parent.type === "FunctionDeclaration"
      || parent.type === "FunctionExpression"
    ) {
      const call = reduceCallForCallback(sourceCode, parent)

      if (call !== null) return reducerParts(parent, call)

      if (callWithArgument(parent) === null) return null
    }

    parent = parent.parent
  }

  return null
}

function referencesAccumulator(
  sourceCode: SourceCode,
  node: ESTree.Node,
  accumulator: Variable,
  visited = new Set<Variable>()
): boolean {
  const variable = resolveArrayBinding(sourceCode, node)

  if (variable === null || visited.has(variable)) return false

  if (variable === accumulator) return true
  visited.add(variable)
  const initializer = constInitializer(variable)

  return (
    initializer !== null && referencesAccumulator(sourceCode, initializer, accumulator, visited)
  )
}

/**
 * How the length of each array copy method's result compares with the accumulator's length. A
 * `window` copy has a fixed length when it passes literal bounds, such as `acc.slice(-2)`.
 */
const ARRAY_COPY_LENGTH = new Map<string, "grow" | "keep" | "window">([
  ["concat", "grow"],
  ["toSpliced", "grow"],
  ["slice", "window"],
  ["toSorted", "keep"],
  ["toReversed", "keep"],
  ["with", "keep"],
])

function isNegativeNumberLiteral(node: ESTree.Node) {
  return (
    node.type === "UnaryExpression"
    && node.operator === "-"
    && isNumberLiteral(node.argument)
    && node.argument.value > 0
  )
}

/**
 * Reports whether a `slice` call copies at most a fixed number of items, such as `slice(-2)` or
 * `slice(0, 3)`.
 */
function hasFixedWindow(args: ESTree.CallExpression["arguments"]) {
  const [start, end] = args

  if (start === undefined) return false

  if (isNegativeNumberLiteral(start)) return true

  return end !== undefined && isNumberLiteral(start) && isNumberLiteral(end)
}

/**
 * Follow `const` bindings to the expression that gives the reducer its initial value.
 */
function resolveInitialValue(
  sourceCode: SourceCode,
  expression: ESTree.Node,
  visited = new Set<Variable>()
): ESTree.Node {
  const node = unwrapArrayExpression(expression)
  const variable = resolveArrayBinding(sourceCode, node)

  if (variable === null || visited.has(variable)) return node
  visited.add(variable)
  const initializer = constInitializer(variable)

  return initializer === null ? node : resolveInitialValue(sourceCode, initializer, visited)
}

/**
 * Reports whether an object literal has only fixed keys, so merging it cannot add keys on each
 * step.
 */
function hasFixedKeys(node: ESTree.Node) {
  return (
    node.type === "ObjectExpression"
    && node.properties.every(
      (property) =>
        property.type === "Property" && staticKeyName(property.key, property.computed) !== null
    )
  )
}

/**
 * Return the expression that the reducer returns when it returns the copy, directly or through more
 * calls that keep its length, such as `acc.with(0, a).with(1, b)`. A copy that the step changes
 * later can grow, so it has no step result.
 */
function stepResult(
  copy: ESTree.Node,
  callback: ESTree.ArrowFunctionExpression | ESTree.Function
): ESTree.Node | null {
  let result = copy
  let parent = result.parent

  while (parent !== null) {
    if (unwrapArrayExpression(parent) === unwrapArrayExpression(result)) {
      result = parent
    } else if (parent.type === "MemberExpression" && parent.object === result) {
      const call = parent.parent
      const method = call.type === "CallExpression" ? arrayMethodTarget(call.callee) : null

      if (method === null || ARRAY_COPY_LENGTH.get(method.name) !== "keep") return null

      result = call
    } else {
      return parent.type === "ReturnStatement" || callback.body === result ? result : null
    }

    parent = result.parent
  }

  return null
}

/**
 * Reports whether the step uses the accumulator only inside its result. A step that also uses the
 * accumulator elsewhere can grow it, as in `acc.push(item)`, before it makes the copy.
 */
function isUsedOnlyIn(accumulator: Variable, result: ESTree.Node | null) {
  return (
    result !== null
    && accumulator.references.every(
      ({ identifier, init }) =>
        init || (identifier.start >= result.start && identifier.end <= result.end)
    )
  )
}

/**
 * Reject non-spread copies of reducer accumulators that can grow on each step. Pair with
 * oxc/no-accumulating-spread.
 */
const rule: Rule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        const method = arrayMethodTarget(node.callee)

        if (method === null) return
        const reducer = enclosingReducer(context.sourceCode, node)

        if (reducer === null) return

        const accumulator = context.sourceCode
          .getDeclaredVariables(reducer.callback)
          .find((variable) =>
            variable.identifiers.some(
              (identifier) => identifier.start === reducer.accumulator.start
            )
          )

        if (accumulator === undefined) return

        const isAccumulator = (expression: ESTree.Node) =>
          referencesAccumulator(context.sourceCode, expression, accumulator)

        const initialValue =
          reducer.initialValue === undefined
            ? null
            : resolveInitialValue(context.sourceCode, reducer.initialValue)

        const arrayCopyLength = ARRAY_COPY_LENGTH.get(method.name)
        let copiesAccumulator = false

        if (
          method.name === "assign"
          && isGlobalObject(context.sourceCode, unwrapArrayExpression(method.object), "Object")
        ) {
          const target = node.arguments[0]

          // A copy keeps a fixed size when the initial value has keys, each merged object has only
          // fixed keys, and the step uses the accumulator only in the copy that it returns.
          const isBounded =
            initialValue?.type === "ObjectExpression"
            && initialValue.properties.length > 0
            && node.arguments.every(
              (argument) => isAccumulator(argument) || hasFixedKeys(unwrapArrayExpression(argument))
            )
            && isUsedOnlyIn(accumulator, stepResult(node, reducer.callback))

          copiesAccumulator =
            target !== undefined
            && unwrapArrayExpression(target).type === "ObjectExpression"
            && node.arguments.slice(1).some(isAccumulator)
            && !isBounded
        } else if (
          method.name === "from"
          && isGlobalObject(context.sourceCode, unwrapArrayExpression(method.object), "Array")
        ) {
          const source = node.arguments[0]
          copiesAccumulator = source !== undefined && isAccumulator(source)
        } else if (arrayCopyLength !== undefined) {
          const arrayAccumulator =
            reducer.initialValue !== undefined
            && isKnownArrayExpression(context.sourceCode, reducer.initialValue)

          // A window copy has a fixed length. A copy that keeps the length of a non-empty tuple
          // keeps a fixed size when the step returns it and uses the accumulator only there.
          const isBounded =
            arrayCopyLength === "window"
              ? hasFixedWindow(node.arguments)
              : arrayCopyLength === "keep"
                && initialValue?.type === "ArrayExpression"
                && initialValue.elements.length > 0
                && isUsedOnlyIn(accumulator, stepResult(node, reducer.callback))

          // `concat` also copies an accumulator that it takes as an argument, such as
          // `[item].concat(acc)`.
          const concatsAccumulator =
            method.name === "concat"
            && isKnownArrayExpression(context.sourceCode, method.object)
            && node.arguments.some(isAccumulator)

          copiesAccumulator =
            arrayAccumulator && (isAccumulator(method.object) || concatsAccumulator) && !isBounded
        }

        if (copiesAccumulator) context.report({ messageId: "accumulatorCopy", node })
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow copying a reducer accumulator that can grow with Object.assign, Array.from, or array copy methods. A copy with a fixed size, such as `acc.slice(-2)`, is allowed.",
    },
    messages: {
      accumulatorCopy:
        "Do not copy the reducer accumulator on every step. Growing copies can cause quadratic work. Start from a new initial value, add to it with `Object.assign(acc, source)`, `acc.push(item)`, or `Map#set`, and return it. To build an object from keys and values, use `Object.fromEntries`.",
    },
    type: "problem",
  },
}

export default rule
