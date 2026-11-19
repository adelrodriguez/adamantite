import type { ESTree, Rule, Visitor } from "@oxlint/plugins"
import { readPositiveIntegerOption } from "../../shared/options.ts"

type Pattern =
  | ESTree.ArrayAssignmentTarget
  | ESTree.ArrayPattern
  | ESTree.ObjectAssignmentTarget
  | ESTree.ObjectPattern

const DEFAULT_MAX_DEPTH = 2

const DEFAULT_MAX_PROPERTIES = 5

function isPattern(node: ESTree.Node): node is Pattern {
  return node.type === "ObjectPattern" || node.type === "ArrayPattern"
}

function getParentPattern(pattern: Pattern) {
  let node: ESTree.Node = pattern.parent

  while (node.type === "AssignmentPattern" || node.type === "RestElement") {
    node = node.parent
  }

  if (node.type === "Property" && node.parent.type === "ObjectPattern") {
    return node.parent
  }

  return isPattern(node) ? node : undefined
}

function getDepth(pattern: Pattern) {
  let depth = 1
  let parent = getParentPattern(pattern)

  while (parent !== undefined) {
    depth += 1
    parent = getParentPattern(parent)
  }

  return depth
}

const rule: Rule = {
  create(context): Visitor {
    const maxDepth = readPositiveIntegerOption(context.options, "maxDepth") ?? DEFAULT_MAX_DEPTH

    const maxProperties =
      readPositiveIntegerOption(context.options, "maxProperties") ?? DEFAULT_MAX_PROPERTIES

    function checkDepth(node: Pattern) {
      const depth = getDepth(node)
      const isFirstPastLimit = depth === maxDepth + 1

      if (isFirstPastLimit) {
        context.report({
          data: { depth: String(depth), maxDepth: String(maxDepth) },
          messageId: "tooDeep",
          node,
        })
      }
    }

    return {
      ArrayPattern: checkDepth,
      ObjectPattern(node) {
        checkDepth(node)

        const count = node.properties.filter((property) => property.type === "Property").length

        if (count > maxProperties) {
          context.report({
            data: { count: String(count), maxProperties: String(maxProperties) },
            messageId: "tooManyProperties",
            node,
          })
        }
      },
    }
  },
  meta: {
    defaultOptions: [{ maxDepth: DEFAULT_MAX_DEPTH, maxProperties: DEFAULT_MAX_PROPERTIES }],
    docs: {
      description:
        "Disallow destructuring patterns that nest too deep or take too many properties from one object.",
    },
    messages: {
      tooDeep:
        "This destructuring pattern is nested {{depth}} levels deep. The limit is {{maxDepth}}. Keep the outer object and read its members, or split the pattern into separate declarations.",
      tooManyProperties:
        "This destructuring pattern takes {{count}} properties from one object. The limit is {{maxProperties}}. Keep the object and read its members where you use them, or split the pattern.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          maxDepth: { minimum: 1, type: "integer" },
          maxProperties: { minimum: 1, type: "integer" },
        },
        type: "object",
      },
    ],
    type: "suggestion",
  },
}

export default rule
