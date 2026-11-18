import type { Rule } from "@oxlint/plugins"

import { withTypeBindings } from "../shared/type-alias-resolution.ts"
import { resolvesToUnknown } from "../shared/unknown-type.ts"

/**
 * Ban named aliases that merely conceal TypeScript's unknown top type.
 */
const rule: Rule = {
  createOnce(context) {
    return withTypeBindings(context, (defer) => ({
      TSTypeAliasDeclaration(node) {
        defer((environment) => {
          if (!resolvesToUnknown(node.typeAnnotation, environment)) {
            return
          }

          context.report({
            data: { alias: node.id.name },
            messageId: "unknownAlias",
            node: node.id,
          })
        })
      },
    }))
  },
  meta: {
    docs: {
      description:
        "Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.",
    },
    messages: {
      unknownAlias:
        "Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.",
    },
    type: "problem",
  },
}

export default rule
