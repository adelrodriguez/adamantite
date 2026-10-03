import type { Context, ESTree, Rule, Visitor } from "@oxlint/plugins"
import { findImportedCalls, type ImportedCall } from "../imports.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs and imports only types from packages.

const QUERY_MODULE = "@tanstack/react-query"
const REACT_MODULE = "react"

const QUERY_HOOKS: ReadonlySet<string> = new Set([
  "useInfiniteQuery",
  "useQuery",
  "useSuspenseInfiniteQuery",
  "useSuspenseQuery",
])

const STATE_HOOKS: ReadonlySet<string> = new Set(["useState"])

function isDataKey(property: ESTree.BindingProperty) {
  return !property.computed && property.key.type === "Identifier" && property.key.name === "data"
}

function getReferences(context: Context, declarator: ESTree.VariableDeclarator, name: string) {
  return context.sourceCode
    .getDeclaredVariables(declarator)
    .filter((variable) => variable.name === name)
    .flatMap((variable) => variable.references)
    .map((reference) => reference.identifier)
}

/**
 * The expressions that read the data of the query result that `call` returns: `query.data` for
 * `const query = useQuery(...)`, and each `data` read for `const { data } = useQuery(...)`.
 */
function findDataReads(context: Context, call: ESTree.CallExpression): ESTree.Node[] {
  const declarator = call.parent

  if (declarator.type !== "VariableDeclarator" || declarator.init !== call) {
    return []
  }

  const { id } = declarator

  if (id.type === "Identifier") {
    return getReferences(context, declarator, id.name).flatMap((identifier) => {
      const member = identifier.parent

      return member.type === "MemberExpression"
        && member.object === identifier
        && !member.computed
        && member.property.name === "data"
        ? [member]
        : []
    })
  }

  if (id.type !== "ObjectPattern") {
    return []
  }

  return id.properties.flatMap((property) => {
    if (property.type !== "Property" || !isDataKey(property)) {
      return []
    }

    const binding =
      property.value.type === "AssignmentPattern" ? property.value.left : property.value

    return binding.type === "Identifier" ? getReferences(context, declarator, binding.name) : []
  })
}

/**
 * Whether `node` evaluates to query data or to a value inside it, such as `query.data`,
 * `data.user.name`, `data ?? []`, or `() => data`.
 */
function readsData(node: ESTree.Node, dataReads: ReadonlySet<ESTree.Node>): boolean {
  if (dataReads.has(node)) {
    return true
  }

  switch (node.type) {
    case "ArrowFunctionExpression":
      return (
        node.expression && node.body.type !== "BlockStatement" && readsData(node.body, dataReads)
      )

    case "ChainExpression":
    case "TSAsExpression":
    case "TSNonNullExpression":
    case "TSSatisfiesExpression":
      return readsData(node.expression, dataReads)

    case "LogicalExpression":
      return readsData(node.left, dataReads) || readsData(node.right, dataReads)

    case "MemberExpression":
      return readsData(node.object, dataReads)

    default:
      return false
  }
}

const rule: Rule = {
  create(context): Visitor {
    const queryCalls: ImportedCall[] = []
    const stateCalls: ImportedCall[] = []

    return {
      ImportDeclaration(node) {
        if (node.source.value === QUERY_MODULE) {
          queryCalls.push(...findImportedCalls(context, node, QUERY_HOOKS))
        } else if (node.source.value === REACT_MODULE) {
          stateCalls.push(...findImportedCalls(context, node, STATE_HOOKS))
        }
      },
      "Program:exit"() {
        if (queryCalls.length === 0 || stateCalls.length === 0) {
          return
        }

        const dataReads = new Set(queryCalls.flatMap(({ call }) => findDataReads(context, call)))

        for (const { call, name } of stateCalls) {
          const [initial] = call.arguments

          if (initial !== undefined && readsData(initial, dataReads)) {
            context.report({ data: { hook: name }, messageId: "copiedData", node: call })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow copying TanStack Query data into React state, where the copy stops updating when the query refetches.",
    },
    messages: {
      copiedData:
        "`{{hook}}` copies query data into local state, so the copy stops updating when the query refetches or another component updates the cache. Read the value from the query result where you use it. To edit it, keep only the user's changes in state and merge them with the query data during render.",
    },
    schema: [],
    type: "problem",
  },
}

export default rule
