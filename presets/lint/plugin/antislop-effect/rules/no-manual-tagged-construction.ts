import type { ESTree, Rule } from "@oxlint/plugins"

import { isMatchPatternObject, isStringLiteral, propertyName } from "../shared/tagged-values.ts"

/**
 * Effect constructors whose input carries `_tag` as data, such as the error code of a
 * `SystemError`. An object passed to one of them already goes through its Effect constructor.
 */
const TAG_INPUT_CONSTRUCTORS = new Set([
  "CookiesErrorReason",
  "HeaderParseErrorReason",
  "MultipartErrorReason",
  "SystemError",
  "systemError",
])

const calleeName = (callee: ESTree.Expression | ESTree.Super): string | undefined => {
  if (callee.type === "Identifier") return callee.name
  if (
    callee.type === "MemberExpression"
    && !callee.computed
    && callee.property.type === "Identifier"
  ) {
    return callee.property.name
  }
  return undefined
}

const isTagInputConstructorArgument = (node: ESTree.ObjectExpression): boolean => {
  const call = node.parent
  if (
    (call?.type !== "CallExpression" && call?.type !== "NewExpression")
    || !call.arguments.includes(node)
  ) {
    return false
  }
  const name = calleeName(call.callee)
  return name !== undefined && TAG_INPUT_CONSTRUCTORS.has(name)
}

const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Construct tagged values with their existing Effect constructor instead of writing `_tag` manually.",
    },
    messages: {
      manualConstruction:
        "Use the existing Schema tagged `.make`, tagged class/error constructor, or Data.taggedEnum variant constructor instead of writing a literal `_tag` object.",
    },
  },
  createOnce(context) {
    return {
      ObjectExpression(node) {
        if (isMatchPatternObject(node) || isTagInputConstructorArgument(node)) return
        const tag = node.properties.find(
          (property) =>
            property.type === "Property"
            && propertyName(property) === "_tag"
            && isStringLiteral(property.value)
        )
        if (tag !== undefined) {
          context.report({ node: tag, messageId: "manualConstruction" })
        }
      },
    }
  },
}

export default rule
