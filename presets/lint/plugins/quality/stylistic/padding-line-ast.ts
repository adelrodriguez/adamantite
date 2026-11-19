// Local replacements for the upstream helper imports. See UPSTREAM.md.
import type { ESTree, SourceCode, Token as SyntaxToken, Comment, Location } from "@oxlint/plugins"

type Token = SyntaxToken | Comment

export const LINEBREAKS: ReadonlySet<string> = new Set(["\r\n", "\r", "\n", "\u2028", "\u2029"])

export function isClosingBraceToken(token: Token): boolean {
  return token.type === "Punctuator" && token.value === "}"
}

export function isSemicolonToken(token: Token): boolean {
  return token.type === "Punctuator" && token.value === ";"
}

export function isNotSemicolonToken(token: Token): boolean {
  return !isSemicolonToken(token)
}

export function isTokenOnSameLine(left: { loc: Location }, right: { loc: Location }): boolean {
  return left.loc.end.line === right.loc.start.line
}

export function isFunction(node: ESTree.Node): boolean {
  return (
    node.type === "FunctionDeclaration"
    || node.type === "FunctionExpression"
    || node.type === "ArrowFunctionExpression"
  )
}

/**
 * Gets the actual last token.
 *
 * If a semicolon is semicolon-less style's semicolon, this ignores it. For example:
 *
 *     foo()
 *     ;[1, 2, 3].forEach(bar)
 *
 * @param node The node to get.
 * @param sourceCode The source code to get tokens.
 *
 * @returns The actual last token.
 */
export function getActualLastToken(node: ESTree.Node, sourceCode: SourceCode): Token {
  const semiToken = sourceCode.getLastToken(node)

  if (semiToken === null) {
    throw new Error("Padding rule invariant: statement has no tokens")
  }

  const prevToken = sourceCode.getTokenBefore(semiToken)
  const nextToken = sourceCode.getTokenAfter(semiToken)

  const isSemicolonLessStyle =
    prevToken
    && nextToken
    && prevToken.range[0] >= node.range[0]
    && isSemicolonToken(semiToken)
    && !isTokenOnSameLine(prevToken, semiToken)
    && isTokenOnSameLine(semiToken, nextToken)

  return isSemicolonLessStyle ? prevToken : semiToken
}

export function isSingleLine(node: ESTree.Node, sourceCode: SourceCode): boolean {
  return node.loc.start.line === getActualLastToken(node, sourceCode).loc.end.line
}

export function fitsOnOneLine(
  node: ESTree.Node,
  sourceCode: SourceCode,
  printWidth: number
): boolean {
  const end = getActualLastToken(node, sourceCode).loc.end

  return node.loc.start.line === end.line && end.column <= printWidth
}

export function skipChainExpression(node: ESTree.Node): ESTree.Node {
  return node.type === "ChainExpression" ? node.expression : node
}

// Only a program or function-body expression can begin a directive prologue.
export function isTopLevelExpressionStatement(
  node: ESTree.Node
): node is ESTree.ExpressionStatement {
  return (
    node.type === "ExpressionStatement"
    && (node.parent.type === "Program"
      || (node.parent.type === "BlockStatement" && isFunction(node.parent.parent)))
  )
}

// A single wrapping pair suffices to exclude a string from directive syntax.
export function isParenthesized(node: ESTree.Node, sourceCode: SourceCode): boolean {
  const before = sourceCode.getTokenBefore(node)
  const after = sourceCode.getTokenAfter(node)

  return before?.value === "(" && after?.value === ")"
}
