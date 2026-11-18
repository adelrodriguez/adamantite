import type { Rule } from "@oxlint/plugins"

import {
  isInsideBroadEffectHandler,
  isTagMember,
  tagMemberFromComparison,
} from "../shared/tagged-values.ts"

const rule: Rule = {
  createOnce(context) {
    return {
      BinaryExpression(node) {
        if (tagMemberFromComparison(node) === undefined || isInsideBroadEffectHandler(node)) {
          return
        }

        context.report({ messageId: "manualComparison", node })
      },
      SwitchStatement(node) {
        if (!isTagMember(node.discriminant) || isInsideBroadEffectHandler(node)) {
          return
        }

        context.report({ messageId: "manualSwitch", node })
      },
    }
  },
  meta: {
    docs: {
      description: "Use Effect Match or Predicate helpers instead of manually branching on `_tag`.",
    },
    messages: {
      manualComparison:
        "Use Match.tag/Match.tags for tagged-value branching, or Predicate.isTagged for a simple reusable predicate.",
      manualSwitch:
        "Use Match.value(value).pipe(Match.tag/Match.tags/Match.tagsExhaustive) or the tagged enum `$match` helper instead of switching on `_tag`.",
    },
    type: "problem",
  },
}

export default rule
