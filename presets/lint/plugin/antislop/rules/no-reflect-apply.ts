import type { Rule } from "@oxlint/plugins"

import { isGlobalReflectMethodCall } from "../shared/reflect-method.ts"

/**
 * Ban Reflect.apply, which bypasses ordinary typed function calls.
 */
const rule: Rule = {
  createOnce(context) {
    return {
      CallExpression(node) {
        if (node.callee.type === "Super" || node.callee.type === "V8IntrinsicExpression") return

        if (isGlobalReflectMethodCall(context.sourceCode, node.callee, "apply")) {
          context.report({ messageId: "reflectApply", node })
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow Reflect.apply; call typed functions directly or model dynamic dispatch behind an interface.",
    },
    messages: {
      reflectApply:
        "Replace `Reflect.apply` with a typed function call. Model dynamic dispatch behind a named interface.",
    },
    type: "problem",
  },
}

export default rule
