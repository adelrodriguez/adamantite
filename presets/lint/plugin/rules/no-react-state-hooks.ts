import type { Context, ESTree, Rule, Visitor } from "@oxlint/plugins"
import { readStringArrayOption } from "../options.ts"

// This module runs under whatever runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs and imports only types from packages.

type MessageId = "banned" | "effect" | "externalStore" | "localState" | "memoization"

const HOOK_MESSAGES: ReadonlyMap<string, MessageId> = new Map([
  ["useCallback", "memoization"],
  ["useEffect", "effect"],
  ["useLayoutEffect", "effect"],
  ["useMemo", "memoization"],
  ["useReducer", "localState"],
  ["useState", "localState"],
  ["useSyncExternalStore", "externalStore"],
])

const DEFAULT_HOOKS: readonly string[] = [...HOOK_MESSAGES.keys()]

/**
 * Modules where hooks are permitted: hook modules such as `useCart.ts` or `use-cart.ts`, and
 * everything under a `hooks` directory. Everything else is feature code, including files such as
 * `userProfile.tsx`.
 */
const DEFAULT_ALLOW: readonly string[] = [
  "**/use[A-Z]*.{ts,tsx}",
  "**/use-*.{ts,tsx}",
  "**/hooks/**",
]

const REACT_MODULE = "react"

function escapeRegExp(text: string) {
  return text.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`)
}

/**
 * Convert a glob to a regular expression that matches a whole path with forward slashes. Supports
 * `**`, `*`, `?`, `[a-z]` and `[!a-z]` character classes, and `{a,b}` alternation.
 */
export function globToRegExp(glob: string): RegExp {
  let source = ""
  let index = 0

  while (index < glob.length) {
    const rest = glob.slice(index)

    if (rest.startsWith("**/")) {
      source += "(?:.*/)?"
      index += 3
    } else if (rest === "/**") {
      source += "(?:/.*)?"
      index += 3
    } else if (rest.startsWith("**")) {
      source += ".*"
      index += 2
    } else if (rest.startsWith("*")) {
      source += "[^/]*"
      index += 1
    } else if (rest.startsWith("?")) {
      source += "[^/]"
      index += 1
    } else if (rest.startsWith("[") && rest.indexOf("]") > 1) {
      const end = rest.indexOf("]")
      const negated = rest.startsWith("[!")
      const characters = rest.slice(negated ? 2 : 1, end).replaceAll(/[\\^]/g, String.raw`\$&`)

      source += `[${negated ? "^" : ""}${characters}]`
      index += end + 1
    } else if (rest.startsWith("{") && rest.includes("}")) {
      const end = rest.indexOf("}")
      const alternatives = rest
        .slice(1, end)
        .split(",")
        .map((alternative) => escapeRegExp(alternative))

      source += `(?:${alternatives.join("|")})`
      index += end + 1
    } else {
      source += escapeRegExp(glob.charAt(index))
      index += 1
    }
  }

  return new RegExp(`^${source}$`)
}

function toPosixPath(path: string) {
  return path.replaceAll("\\", "/")
}

/**
 * The path that `allow` globs match: relative to the working directory when the file is inside it,
 * and absolute otherwise.
 */
function getMatchPath(context: Context) {
  const filename = toPosixPath(context.filename)
  const cwd = toPosixPath(context.cwd).replace(/\/$/, "")

  return filename.startsWith(`${cwd}/`) ? filename.slice(cwd.length + 1) : filename
}

function getImportedName(specifier: ESTree.ImportSpecifier) {
  return specifier.imported.type === "Literal" ? specifier.imported.value : specifier.imported.name
}

function isStringLiteral(node: ESTree.Expression): node is ESTree.StringLiteral {
  return node.type === "Literal" && typeof node.value === "string"
}

function getPropertyName(member: ESTree.MemberExpression) {
  if (!member.computed) {
    return member.property.type === "Identifier" ? member.property.name : undefined
  }

  return isStringLiteral(member.property) ? member.property.value : undefined
}

function isCallee(node: ESTree.Node) {
  const { parent } = node

  return parent?.type === "CallExpression" && parent.callee === node
}

const rule: Rule = {
  create(context): Visitor {
    const hooks = new Set(readStringArrayOption(context.options, "hooks") ?? DEFAULT_HOOKS)
    const allow = (readStringArrayOption(context.options, "allow") ?? DEFAULT_ALLOW).map((glob) =>
      globToRegExp(glob)
    )
    const matchPath = getMatchPath(context)

    if (allow.some((pattern) => pattern.test(matchPath))) {
      return {}
    }

    function report(node: ESTree.Node, hook: string) {
      context.report({ data: { hook }, messageId: HOOK_MESSAGES.get(hook) ?? "banned", node })
    }

    function getReferences(specifier: ESTree.ImportDeclarationSpecifier) {
      return context.sourceCode
        .getDeclaredVariables(specifier)
        .flatMap((variable) => variable.references)
        .map((reference) => reference.identifier)
    }

    return {
      ImportDeclaration(node) {
        if (node.source.value !== REACT_MODULE || node.importKind === "type") {
          return
        }

        for (const specifier of node.specifiers) {
          if (specifier.type === "ImportSpecifier") {
            const hook = getImportedName(specifier)

            if (specifier.importKind === "type" || !hooks.has(hook)) {
              continue
            }

            for (const identifier of getReferences(specifier)) {
              if (isCallee(identifier)) {
                report(identifier.parent, hook)
              }
            }

            continue
          }

          // `import React from "react"` and `import * as React from "react"`: report
          // `React.useState(...)` calls.
          for (const identifier of getReferences(specifier)) {
            const member = identifier.parent

            if (member.type !== "MemberExpression" || member.object !== identifier) {
              continue
            }

            const hook = getPropertyName(member)

            if (hook !== undefined && hooks.has(hook) && isCallee(member)) {
              report(member.parent, hook)
            }
          }
        }
      },
    }
  },
  meta: {
    defaultOptions: [{ allow: [...DEFAULT_ALLOW], hooks: [...DEFAULT_HOOKS] }],
    docs: {
      description:
        "Disallow React state, effect, and memoization hooks in feature code. Hooks stay allowed in hook modules.",
    },
    messages: {
      banned: "`{{hook}}` is not allowed in feature code. Move it into a hook module.",
      effect:
        "`{{hook}}` runs a side effect in feature code. Move the side effect to a loader, an action, or an event handler.",
      externalStore:
        "`{{hook}}` subscribes to an external store in feature code. Subscribe through a query or a store abstraction instead.",
      localState:
        "`{{hook}}` keeps local state in feature code. Derive the value from loader data or URL params instead.",
      memoization:
        "`{{hook}}` memoizes by hand. Remove it: the React Compiler handles memoization.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          allow: { items: { type: "string" }, type: "array" },
          hooks: { items: { type: "string" }, type: "array" },
        },
        type: "object",
      },
    ],
    type: "suggestion",
  },
}

export default rule
