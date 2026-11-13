import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { isGlobalReflectMethodCall } from "../shared/reflect-method.ts"

/**
 * Reports whether a call passes a receiver that differs from the target. Property syntax cannot
 * pass a receiver, so a Proxy `get` trap needs `Reflect.get(target, key, receiver)` to give a
 * getter the correct `this`.
 */
function hasDistinctReceiver(sourceCode: SourceCode, args: ESTree.CallExpression["arguments"]) {
  const [target, , receiver] = args

  if (target === undefined || receiver === undefined) return false

  if (target.type === "SpreadElement" || receiver.type === "SpreadElement") return false

  return sourceCode.getText(receiver) !== sourceCode.getText(target)
}

/**
 * Ban Reflect.get, which bypasses ordinary property access and useful type evidence.
 */
const rule: Rule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Super" || node.callee.type === "V8IntrinsicExpression") return

        if (
          isGlobalReflectMethodCall(context.sourceCode, node.callee, "get")
          && !hasDistinctReceiver(context.sourceCode, node.arguments)
        ) {
          context.report({ messageId: "reflectGet", node })
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow Reflect.get without a receiver. Use typed property access, or parse dynamic input into a domain type. A call that passes a receiver, such as in a Proxy get trap, is allowed.",
    },
    messages: {
      reflectGet:
        "Replace `Reflect.get` with typed property access. Parse dynamic input into a named domain type before reading it.",
    },
    type: "problem",
  },
}

export default rule
