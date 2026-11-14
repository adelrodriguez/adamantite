import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { resolveVariable } from "../shared/scope.ts"

// Parentheses and type operators do not change the value that a branch spreads.
const EXPRESSION_WRAPPERS: ReadonlySet<string> = new Set([
  "ParenthesizedExpression",
  "TSAsExpression",
  "TSSatisfiesExpression",
  "TSTypeAssertion",
  "TSNonNullExpression",
])

function unwrapExpression(node: ESTree.Expression): ESTree.Expression {
  let current = node

  while (
    current.type === "ParenthesizedExpression"
    || current.type === "TSAsExpression"
    || current.type === "TSSatisfiesExpression"
    || current.type === "TSTypeAssertion"
    || current.type === "TSNonNullExpression"
  ) {
    current = current.expression
  }

  return current
}

/**
 * Return whether code only spreads a value at this node: as the argument of a spread, or as a
 * branch of a conditional that code spreads. A spread reads the value and cannot fill it.
 */
function isOnlySpread(node: ESTree.Node): boolean {
  const { parent } = node

  if (parent === null) return false

  if (parent.type === "SpreadElement") return parent.parent.type === "ObjectExpression"

  if (parent.type === "JSXSpreadAttribute") return true

  if (parent.type === "ConditionalExpression") return parent.test !== node && isOnlySpread(parent)

  return EXPRESSION_WRAPPERS.has(parent.type) && isOnlySpread(parent)
}

function isEmptyObjectExpression(node: ESTree.Expression): boolean {
  return node.type === "ObjectExpression" && node.properties.length === 0
}

function isNullLiteral(node: ESTree.Expression): boolean {
  return node.type === "Literal" && node.value === null && !("regex" in node)
}

/**
 * Return whether an identifier is the global `undefined` or a `const` that holds `{}`. The `const`
 * holds `{}` only when code does nothing with it but spread it, because a property write, a call
 * such as `Object.assign(fallback, values)`, or any other use can fill it.
 */
function isEmptyBinding(sourceCode: SourceCode, node: ESTree.IdentifierReference): boolean {
  const variable = resolveVariable(sourceCode, node)

  if (node.name === "undefined" && (variable === null || variable.defs.length === 0)) return true

  if (variable?.defs.length !== 1) return false
  const [definition] = variable.defs

  return (
    variable.references.every((reference) => reference.init || isOnlySpread(reference.identifier))
    && definition?.type === "Variable"
    && definition.node.type === "VariableDeclarator"
    && definition.node.parent.type === "VariableDeclaration"
    && definition.node.parent.kind === "const"
    && definition.node.init !== null
    && isEmptyObjectExpression(unwrapExpression(definition.node.init))
  )
}

/**
 * Return whether spreading a branch adds no property: `{}`, `undefined`, `null`, or `void 0`.
 */
function isEmptyBranch(sourceCode: SourceCode, node: ESTree.Expression): boolean {
  const branch = unwrapExpression(node)

  return (
    isEmptyObjectExpression(branch)
    || isNullLiteral(branch)
    || (branch.type === "UnaryExpression" && branch.operator === "void")
    || (branch.type === "Identifier" && isEmptyBinding(sourceCode, branch))
    || addsNothingOnSomeBranch(sourceCode, branch)
  )
}

/**
 * Return whether a conditional spread adds nothing on one of its branches. `a && b` spreads a falsy
 * value when `a` is falsy, so it omits properties the same way as `a ? b : {}`.
 */
function addsNothingOnSomeBranch(sourceCode: SourceCode, node: ESTree.Expression): boolean {
  const spread = unwrapExpression(node)

  if (spread.type === "LogicalExpression") return spread.operator === "&&"

  return (
    spread.type === "ConditionalExpression"
    && (isEmptyBranch(sourceCode, spread.consequent) || isEmptyBranch(sourceCode, spread.alternate))
  )
}

/**
 * Ban conditional empty-object spreads without changing their omission semantics.
 */
const rule: Rule = {
  createOnce(context) {
    const check = (node: ESTree.JSXSpreadAttribute | ESTree.SpreadElement) => {
      if (addsNothingOnSomeBranch(context.sourceCode, node.argument)) {
        context.report({ messageId: "avoid", node })
      }
    }

    return {
      JSXSpreadAttribute: check,
      SpreadElement(node) {
        if (node.parent.type === "ObjectExpression") check(node)
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow object and JSX spreads that conditionally spread an empty object, a falsy value, undefined, or null to omit fields.",
    },
    messages: {
      avoid:
        "This conditional spread hides property omission behind a branch that adds nothing. Build the object in separate statements and add the property only when present.",
    },
    type: "suggestion",
  },
}

export default rule
