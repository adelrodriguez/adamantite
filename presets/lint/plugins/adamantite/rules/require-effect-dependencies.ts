import type { ESTree, Rule, Visitor } from "@oxlint/plugins"
import { findImportedCalls } from "../shared/imports.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs and imports only types from packages.

const EFFECT_HOOKS: ReadonlySet<string> = new Set([
  "useEffect",
  "useInsertionEffect",
  "useLayoutEffect",
])

const REACT_MODULE = "react"

/**
 * Whether React runs the effect after every render: the call passes no dependency array, or passes
 * `undefined` or `null` in its place. A spread argument can hold the array, so a call with one
 * passes.
 */
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
