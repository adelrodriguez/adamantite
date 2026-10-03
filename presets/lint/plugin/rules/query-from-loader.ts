import type { Context, ESTree, Rule, Scope, Variable, Visitor } from "@oxlint/plugins"
import { findImportedCalls, type ImportedCall } from "../imports.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs and imports only types from packages.

type MessageId = "plainObject" | "localOptions"

const QUERY_MODULE = "@tanstack/react-query"

const QUERY_HOOKS: ReadonlySet<string> = new Set([
  "useInfiniteQuery",
  "useQuery",
  "useSuspenseInfiniteQuery",
  "useSuspenseQuery",
])

const OPTIONS_FACTORIES: ReadonlySet<string> = new Set(["infiniteQueryOptions", "queryOptions"])

function findVariable(context: Context, identifier: ESTree.Node & { readonly name: string }) {
  let scope: Scope | null = context.sourceCode.getScope(identifier)

  while (scope !== null && !scope.set.has(identifier.name)) {
    scope = scope.upper
  }

  return scope?.set.get(identifier.name)
}

/**
 * The initializer of a `const` that declares `variable` with a plain identifier, such as `const
 * options = { ... }`. Destructured, `let`, and imported bindings have none.
 */
function getConstInit(variable: Variable) {
  const [definition] = variable.defs

  if (variable.defs.length !== 1 || definition?.type !== "Variable") {
    return
  }

  const { node, parent } = definition

  if (
    node.type !== "VariableDeclarator"
    || node.id.type !== "Identifier"
    || parent?.type !== "VariableDeclaration"
    || parent.kind !== "const"
  ) {
    return
  }

  return node.init ?? undefined
}

function isModuleScope(variable: Variable) {
  return variable.scope.type === "module" || variable.scope.type === "global"
}

const rule: Rule = {
  create(context): Visitor {
    const hookCalls: ImportedCall[] = []
    const factoryCalls = new Set<ESTree.CallExpression>()

    /**
     * Why `options` does not come from a shared definition, or `undefined` when it does or when the
     * rule cannot tell. `inModule` is true when the expression sits at module scope.
     */
    function classify(options: ESTree.Node, inModule: boolean): MessageId | undefined {
      if (options.type === "ObjectExpression") {
        // `{ ...userQuery(id), select }` extends shared options.
        return options.properties.some((property) => property.type === "SpreadElement")
          ? undefined
          : "plainObject"
      }

      if (options.type === "CallExpression" && factoryCalls.has(options)) {
        return inModule ? undefined : "localOptions"
      }

      if (options.type === "Identifier") {
        const variable = findVariable(context, options)
        const init = variable === undefined ? undefined : getConstInit(variable)

        return variable === undefined || init === undefined
          ? undefined
          : classify(init, isModuleScope(variable))
      }

      return undefined
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== QUERY_MODULE) {
          return
        }

        hookCalls.push(...findImportedCalls(context, node, QUERY_HOOKS))

        for (const { call } of findImportedCalls(context, node, OPTIONS_FACTORIES)) {
          factoryCalls.add(call)
        }
      },
      "Program:exit"() {
        for (const { call, name } of hookCalls) {
          const [options] = call.arguments

          if (options === undefined) {
            continue
          }

          const messageId = classify(options, false)

          if (messageId !== undefined) {
            context.report({ data: { hook: name }, messageId, node: options })
          }
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Require TanStack Query hooks to take options defined once with `queryOptions()`, so a route loader can preload the same query.",
    },
    messages: {
      localOptions:
        "`{{hook}}` takes query options created inside a function, so a route loader cannot preload the same query. Move the `queryOptions()` call to module scope, or into an exported factory such as `userQuery(id)`, preload it in the route loader with `queryClient.ensureQueryData()`, and pass the same options here.",
      plainObject:
        "`{{hook}}` takes a plain options object instead of options defined with `queryOptions()`. Define the options once with `queryOptions()` in a module that the route loader also imports, preload them in the loader with `queryClient.ensureQueryData()`, and pass the same options here.",
    },
    schema: [],
    type: "suggestion",
  },
}

export default rule
