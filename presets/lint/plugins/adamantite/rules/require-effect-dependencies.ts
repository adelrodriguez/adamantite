import type { ESTree, Rule, Visitor } from "@oxlint/plugins"
import { findImportedCalls } from "../shared/imports.ts"

const EFFECT_HOOKS: ReadonlySet<string> = new Set([
  "useEffect",
  "useInsertionEffect",
  "useLayoutEffect",
])

const REACT_MODULE = "react"

function runsAfterEveryRender(call: ESTree.CallExpression) {
  if (call.arguments.some((argument) => argument.type === "SpreadElement")) {
    return false
  }

  const dependencies = call.arguments[1]

  return (
    dependencies === undefined
    || (dependencies.type === "Identifier" && dependencies.name === "undefined")
    || (dependencies.type === "Literal" && dependencies.value === null)
  )
}

const rule: Rule = {
  create(context): Visitor {
    return {
      ImportDeclaration(node) {
        if (node.source.value !== REACT_MODULE) {
          return
        }

        for (const { call, name } of findImportedCalls(context, node, EFFECT_HOOKS)) {
          if (runsAfterEveryRender(call)) {
            context.report({ data: { hook: name }, messageId: "missing", node: call })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description: "Require a dependency array in each call to a React effect hook.",
    },
    messages: {
      missing:
        "`{{hook}}` has no dependency array, so it runs after every render. Pass the values that the effect reads, or `[]` when it reads none.",
    },
    schema: [],
    type: "problem",
  },
}

export default rule
