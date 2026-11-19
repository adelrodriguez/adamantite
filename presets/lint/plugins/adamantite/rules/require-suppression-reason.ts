import type { Rule, Visitor } from "@oxlint/plugins"

const SUPPRESSION = /^\s*(?:eslint|oxlint)-disable(?:-line|-next-line)?(?=\s|$)/u

// ESLint and Oxlint read the description of a directive after two or more dashes with white
// space on both sides.
const REASON = /\s-{2,}\s(.*)$/su

const rule: Rule = {
  create(context): Visitor {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          if (!SUPPRESSION.test(comment.value)) {
            continue
          }

          const reason = REASON.exec(comment.value)?.[1]?.trim()

          if (!reason) {
            context.report({ messageId: "missingReason", node: comment })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Require a reason after ` -- ` on each comment that turns off lint rules.",
    },
    messages: {
      missingReason:
        "Give this suppression a reason after ` -- `, such as `// oxlint-disable-next-line no-console -- the CLI writes its report to stdout`. Fix the code instead if no reason applies.",
    },
    schema: [],
    type: "suggestion",
  },
}

export default rule
