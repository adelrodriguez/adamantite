import type { ESTree, Rule } from "@oxlint/plugins"

type TypeAssertionExpression = ESTree.TSAsExpression | ESTree.TSTypeAssertion

// Parentheses and `satisfies` keep the type of their operand, so a chain continues through them.
type TransparentExpression = ESTree.ParenthesizedExpression | ESTree.TSSatisfiesExpression

function isTypeAssertionExpression(node: ESTree.Node): node is TypeAssertionExpression {
  return node.type === "TSAsExpression" || node.type === "TSTypeAssertion"
}

function isTransparentExpression(node: ESTree.Node): node is TransparentExpression {
  return node.type === "ParenthesizedExpression" || node.type === "TSSatisfiesExpression"
}

function unwrapTransparentExpression(expression: ESTree.Expression): ESTree.Expression {
  let current = expression

  while (isTransparentExpression(current)) {
    current = current.expression
  }

  return current
}

function isConstAssertion(node: TypeAssertionExpression): boolean {
  const { typeAnnotation } = node

  return (
    typeAnnotation.type === "TSTypeReference"
    && typeAnnotation.typeName.type === "Identifier"
    && typeAnnotation.typeName.name === "const"
  )
}

function isOutermostAssertionInChain(node: TypeAssertionExpression): boolean {
  let current: ESTree.Expression = node
  let parent = node.parent

  while (isTransparentExpression(parent) && parent.expression === current) {
    current = parent
    parent = parent.parent
  }

  return !isTypeAssertionExpression(parent) || parent.expression !== current
}

function isForbiddenAssertionChain(node: TypeAssertionExpression): boolean {
  let assertionCount = 0
  let hasNonConstAssertion = false
  let current: ESTree.Expression = node

  while (isTypeAssertionExpression(current)) {
    assertionCount += 1
    hasNonConstAssertion ||= !isConstAssertion(current)
    current = unwrapTransparentExpression(current.expression)
  }

  return assertionCount > 1 && hasNonConstAssertion
}

/**
 * Disallow nested TypeScript type assertions, while permitting chains made only of const
 * assertions.
 */
const rule: Rule = {
  createOnce(context) {
    const checkTypeAssertion = (node: TypeAssertionExpression) => {
      if (!isOutermostAssertionInChain(node) || !isForbiddenAssertionChain(node)) return
      context.report({ messageId: "chained", node })
    }

    return {
      TSAsExpression: checkTypeAssertion,
      TSTypeAssertion: checkTypeAssertion,
    }
  },
  meta: {
    docs: {
      description:
        "Disallow chained TypeScript as and angle-bracket assertions, including chains through parentheses or satisfies.",
    },
    messages: {
      chained:
        "This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it. If a test passes input of the wrong type on purpose, pass it without an assertion and put `// @ts-expect-error -- reason` above the call.",
    },
    type: "problem",
  },
}

export default rule
