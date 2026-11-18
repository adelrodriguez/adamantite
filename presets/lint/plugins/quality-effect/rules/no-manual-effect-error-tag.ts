import type { Rule } from "@oxlint/plugins"

import {
  isInsideBroadEffectHandler,
  isReasonTagMember,
  isTagMember,
  tagMemberFromComparison,
} from "../shared/tagged-values.ts"

const rule: Rule = {
  createOnce(context) {
    return {
      BinaryExpression(node) {
        const tagMember = tagMemberFromComparison(node)

        if (tagMember === undefined || !isInsideBroadEffectHandler(node)) {
          return
        }

        context.report({
          messageId: isReasonTagMember(tagMember) ? "reason" : "tag",
          node,
        })
      },
      SwitchStatement(node) {
        if (!isTagMember(node.discriminant) || !isInsideBroadEffectHandler(node)) {
          return
        }

        context.report({
          messageId: isReasonTagMember(node.discriminant) ? "reason" : "tag",
          node,
        })
      },
    }
  },
  meta: {
    docs: {
      description:
        "Use Effect tagged error handlers instead of manually branching on `_tag` in a catch handler.",
    },
    messages: {
      reason:
        "Use Effect.catchReason or Effect.catchReasons instead of manually discriminating a tagged `reason` in a broad Effect catch handler.",
      tag: "Use Effect.catchTag or Effect.catchTags instead of manually discriminating a tagged error in a broad Effect catch handler.",
    },
    type: "problem",
  },
}

export default rule
