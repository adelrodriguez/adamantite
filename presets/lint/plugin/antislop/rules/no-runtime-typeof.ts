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

function isInsideTypeGuard(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent

  while (current !== null && current.type !== "Program") {
    if (isRuntimeFunction(current)) {
      return current.returnType?.typeAnnotation.type === "TSTypePredicate"
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
