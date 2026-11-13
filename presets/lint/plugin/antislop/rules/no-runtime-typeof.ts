import type { ESTree, Rule } from "@oxlint/plugins"
import { readBooleanOption } from "../../options.ts"

type RuntimeFunction = ESTree.ArrowFunctionExpression | ESTree.Function

function isRuntimeFunction(node: ESTree.Node): node is RuntimeFunction {
  return (
    node.type === "ArrowFunctionExpression"
    || node.type === "FunctionDeclaration"
    || node.type === "FunctionExpression"
  )
}

/**
 * Return a function's declared return type. It comes from the function's own annotation, or from
 * the function type that annotates the variable it initializes.
 */
function declaredReturnType(fn: RuntimeFunction): ESTree.TSType | undefined {
  if (fn.returnType) return fn.returnType.typeAnnotation
  const declarator = fn.parent

  if (declarator.type !== "VariableDeclarator" || declarator.init !== fn) return undefined
  const annotation = declarator.id.typeAnnotation?.typeAnnotation

  return annotation?.type === "TSFunctionType" ? annotation.returnType.typeAnnotation : undefined
}

/**
 * Return whether a function is passed inline to a call, as in `values.every((item) => ...)`.
 */
function isInlineCallback(fn: RuntimeFunction): boolean {
  const call = fn.parent

  return call.type === "CallExpression" && call.arguments.some((argument) => argument === fn)
}

/**
 * Return whether a node runs inside a type guard. An inline callback without its own return type
 * belongs to the function that passes it, so the search continues to that function.
 */
function isInsideTypeGuard(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent

  while (current !== null && current.type !== "Program") {
    if (isRuntimeFunction(current)) {
      const returnType = declaredReturnType(current)

      if (returnType !== undefined) return returnType.type === "TSTypePredicate"

      if (!isInlineCallback(current)) return false
    }

    current = current.parent
  }

  return false
}

/**
 * Return whether typeof safely probes for the existence of a possibly absent binding.
 */
function isExistenceProbe(node: ESTree.UnaryExpression): boolean {
  const parent = node.parent

  if (parent.type !== "BinaryExpression") return false

  if (!["===", "!==", "==", "!="].includes(parent.operator)) return false
  const other = parent.left === node ? parent.right : parent.left

  return other.type === "Literal" && other.value === "undefined"
}

/**
 * Disallow runtime typeof checks that narrow unparsed values instead of decoding them.
 */
const rule: Rule = {
  createOnce(context) {
    return {
      UnaryExpression(node) {
        const allowInTypeGuards = readBooleanOption(context.options, "allowInTypeGuards") === true

        if (
          node.operator === "typeof"
          && !isExistenceProbe(node)
          && (!allowInTypeGuards || !isInsideTypeGuard(node))
        ) {
          context.report({ messageId: "runtimeTypeof", node })
        }
      },
    }
  },
  meta: {
    defaultOptions: [{ allowInTypeGuards: false }],
    docs: {
      description:
        "Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.",
    },
    messages: {
      runtimeTypeof:
        "A `typeof` check narrows a representation without establishing its contract. Parse input at its I/O boundary, then branch on the domain value.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          allowInTypeGuards: { type: "boolean" },
        },
        type: "object",
      },
    ],
    type: "problem",
  },
}

export default rule
