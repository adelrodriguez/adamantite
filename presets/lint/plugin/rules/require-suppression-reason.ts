import type { Rule, Visitor } from "@oxlint/plugins"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs and imports only types from packages.

/**
 * A comment that turns off lint rules: `oxlint-disable`, `eslint-disable`, and their `-line` and
 * `-next-line` forms. An `-enable` comment turns rules back on, so it needs no reason.
 */
const SUPPRESSION = /^\s*(?:eslint|oxlint)-disable(?:-line|-next-line)?(?=\s|$)/u

/**
 * The reason follows two or more dashes with white space on both sides, as ESLint and Oxlint parse
 * a directive description.
 */
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
