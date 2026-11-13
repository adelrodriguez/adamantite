// Vendored from ESLint Stylistic; see UPSTREAM.md and LICENSE in this directory.
import type {
  ESTree,
  Context as RuleContext,
  SourceCode,
  Token as SyntaxToken,
  Comment,
  CreateRule,
  Location,
} from "@oxlint/plugins"

import type { PaddingType, SelectorOption, StatementMatcher } from "./padding-line-options.ts"
import { isStringLiteral } from "../shared/literals.ts"
import {
  getActualLastToken,
  isClosingBraceToken,
  isFunction,
  isNotSemicolonToken,
  isParenthesized,
  isSingleLine,
  isTokenOnSameLine,
  isTopLevelExpressionStatement,
  LINEBREAKS,
  skipChainExpression,
} from "./padding-line-ast.ts"

type ASTNode = ESTree.Node

type Token = SyntaxToken | Comment

const CJS_EXPORT = /^(?:module\s*\.\s*)?exports(?:\s*\.|\s*\[|$)/u

/**
 * This rule is a replica of padding-line-between-statements.
 *
 * Ideally we would want to extend the rule support typescript specific support. But since not all
 * the state is exposed by the eslint and eslint has frozen stylistic rules, (see -
 * https://eslint.org/blog/2020/05/changes-to-rules-policies for details.) we are forced to
 * re-implement the rule here.
 *
 * We have tried to keep the implementation as close as possible to the eslint implementation, to
 * make patching easier for future contributors.
 *
 * Reference rule -
 * https://github.com/eslint/eslint/blob/main/lib/rules/padding-line-between-statements.js
 */

type NodeTest = (node: ASTNode, sourceCode: SourceCode) => boolean

export interface NodeTestObject {
  test: NodeTest
}

/**
 * A policy entry may name a caller-defined statement type (registered through
 * `createPaddingLineRule`) anywhere the upstream statement types are accepted.
 */
export type PolicyStatementOption<Extra extends string = never> =
  | StatementMatcher
  | Extra
  | [StatementMatcher | Extra, ...Array<StatementMatcher | Extra>]

export type PolicyOptions<Extra extends string = never> = Array<{
  blankLine: PaddingType
  prev: PolicyStatementOption<Extra>
  next: PolicyStatementOption<Extra>
}>

const LT = `[${Array.from(LINEBREAKS).join("")}]`
const PADDING_LINE_SEQUENCE = new RegExp(String.raw`^(\s*?${LT})\s*${LT}(\s*;?)$`, "u")

function isSelectorOption(option: PolicyStatementOption<string>): option is SelectorOption {
  return typeof option === "object" && !Array.isArray(option)
}

/**
 * Creates tester which check if a node starts with specific keyword with the appropriate
 * AST_NODE_TYPES.
 *
 * @param keyword The keyword to test.
 *
 * @returns The created tester.
 */
function newKeywordTester(type: string | string[], keyword: string): NodeTestObject {
  return {
    test(node, sourceCode): boolean {
      const isSameKeyword = sourceCode.getFirstToken(node)?.value === keyword
      const isSameType = Array.isArray(type) ? type.includes(node.type) : type === node.type

      return isSameKeyword && isSameType
    },
  }
}

/**
 * Creates tester which check if a node is specific type.
 *
 * @param type The node type to test.
 *
 * @returns The created tester.
 */
function newNodeTypeTester(type: string): NodeTestObject {
  return {
    test: (node): boolean => node.type === type,
  }
}

/**
 * Checks the given node is an expression statement of IIFE.
 *
 * @param node The node to check.
 *
 * @returns `true` if the node is an expression statement of IIFE.
 */
function isIIFEStatement(node: ASTNode): boolean {
  if (node.type === "ExpressionStatement") {
    let expression = skipChainExpression(node.expression)

    if (expression.type === "UnaryExpression") expression = skipChainExpression(expression.argument)

    if (expression.type === "CallExpression") {
      let node: ASTNode = expression.callee

      while (node.type === "SequenceExpression") {
        const lastExpression = node.expressions.at(-1)

        if (lastExpression === undefined)
          throw new Error("Padding rule invariant: sequence expression is empty")
        node = lastExpression
      }

      return isFunction(node)
    }
  }

  return false
}

/**
 * Checks the given node is a CommonJS require statement
 *
 * @param node The node to check.
 *
 * @returns `true` if the node is a CommonJS require statement.
 */
function isCJSRequire(node: ASTNode): boolean {
  if (node.type === "VariableDeclaration") {
    const declaration = node.declarations[0]

    if (declaration?.init) {
      let call = declaration.init

      while (call.type === "MemberExpression") call = call.object

      if (call.type === "CallExpression" && call.callee.type === "Identifier") {
        return call.callee.name === "require"
      }
    }
  }

  return false
}

/**
 * Checks whether the given node is a block-like statement. This checks the last token of the node
 * is the closing brace of a block.
 *
 * @param sourceCode The source code to get tokens.
 * @param node The node to check.
 *
 * @returns `true` if the node is a block-like statement.
 */
function isBlockLikeStatement(node: ASTNode, sourceCode: SourceCode): boolean {
  // do-while with a block is a block-like statement.
  if (node.type === "DoWhileStatement" && node.body.type === "BlockStatement") {
    return true
  }

  /**
   * IIFE is a block-like statement specially from JSCS#disallowPaddingNewLinesAfterBlocks.
   */
  if (isIIFEStatement(node)) return true

  // Checks the last token is a closing brace of blocks.
  const lastToken = sourceCode.getLastToken(node, isNotSemicolonToken)

  const belongingNode =
    lastToken && isClosingBraceToken(lastToken)
      ? sourceCode.getNodeByRangeIndex(lastToken.range[0])
      : null

  return (
    !!belongingNode
    && (belongingNode.type === "BlockStatement" || belongingNode.type === "SwitchStatement")
  )
}

/**
 * Check whether the given node is a directive or not.
 *
 * @param node The node to check.
 * @param sourceCode The source code object to get tokens.
 *
 * @returns `true` if the node is a directive.
 */
function isDirective(node: ASTNode, sourceCode: SourceCode): boolean {
  return (
    isTopLevelExpressionStatement(node)
    && isStringLiteral(node.expression)
    && !isParenthesized(node.expression, sourceCode)
  )
}

/**
 * Check whether the given node is a part of directive prologue or not.
 *
 * @param node The node to check.
 * @param sourceCode The source code object to get tokens.
 *
 * @returns `true` if the node is a part of directive prologue.
 */
function isDirectivePrologue(node: ASTNode, sourceCode: SourceCode): boolean {
  if (
    isDirective(node, sourceCode)
    && node.parent
    && "body" in node.parent
    && Array.isArray(node.parent.body)
  ) {
    for (const sibling of node.parent.body) {
      if (sibling === node) break

      if (!isDirective(sibling, sourceCode)) return false
    }

    return true
  }

  return false
}

/**
 * Checks the given node is a CommonJS export statement
 *
 * @param node The node to check.
 *
 * @returns `true` if the node is a CommonJS export statement.
 */
function isCJSExport(node: ASTNode): boolean {
  if (node.type === "ExpressionStatement") {
    const expression = node.expression

    if (expression.type === "AssignmentExpression") {
      let left = expression.left

      if (left.type === "MemberExpression") {
        while (left.object.type === "MemberExpression") left = left.object

        return (
          left.object.type === "Identifier"
          && (left.object.name === "exports"
            || (left.object.name === "module"
              && left.property.type === "Identifier"
              && left.property.name === "exports"))
        )
      }
    }
  }

  return false
}

/**
 * Check whether the given node is an expression
 *
 * @param node The node to check.
 * @param sourceCode The source code object to get tokens.
 *
 * @returns `true` if the node is an expression
 */
function isExpression(node: ASTNode, sourceCode: SourceCode): boolean {
  return node.type === "ExpressionStatement" && !isDirectivePrologue(node, sourceCode)
}

/**
 * This returns the concatenation of the first 2 captured strings.
 *
 * @param _ Unused. Whole matched string.
 * @param trailingSpaces The trailing spaces of the first line.
 * @param indentSpaces The indentation spaces of the last line.
 *
 * @returns The concatenation of trailingSpaces and indentSpaces.
 */
function replacerToRemovePaddingLines(
  _: string,
  trailingSpaces: string,
  indentSpaces: string
): string {
  return trailingSpaces + indentSpaces
}

function getReportLoc(node: ASTNode, sourceCode: SourceCode): Location {
  if (isSingleLine(node, sourceCode)) return node.loc

  const line = node.loc.start.line
  const sourceLine = sourceCode.lines[line - 1]

  if (sourceLine === undefined)
    throw new Error("Padding rule invariant: statement source line is missing")

  return {
    end: {
      column: sourceLine.length,
      line,
    },
    start: node.loc.start,
  }
}

/**
 * Check and report statements for `any` configuration. It does nothing.
 */
function verifyForAny(): void {
  // Empty
}

/**
 * Check and report statements for `never` configuration. This autofix removes blank lines between
 * the given 2 statements. However, if comments exist between 2 blank lines, it does not remove
 * those blank lines automatically.
 *
 * @param context The rule context to report.
 * @param _ Unused. The previous node to check.
 * @param nextNode The next node to check.
 * @param paddingLines The array of token pairs that blank lines exist between the pair.
 */
function verifyForNever(
  context: RuleContext,
  _: ASTNode,
  nextNode: ASTNode,
  paddingLines: Array<[Token, Token]>
): void {
  if (paddingLines.length === 0) return

  context.report({
    fix(fixer) {
      if (paddingLines.length >= 2) return null

      const paddingPair = paddingLines[0]

      if (paddingPair === undefined)
        throw new Error("Padding rule invariant: reported padding pair is missing")
      const [prevToken, nextToken] = paddingPair
      const start = prevToken.range[1]
      const end = nextToken.range[0]

      const text = context.sourceCode.text
        .slice(start, end)
        .replace(PADDING_LINE_SEQUENCE, replacerToRemovePaddingLines)

      return fixer.replaceTextRange([start, end], text)
    },
    loc: getReportLoc(nextNode, context.sourceCode),
    messageId: "unexpectedBlankLine",
    node: nextNode,
  })
}

/**
 * Check and report statements for `always` configuration. This autofix inserts a blank line between
 * the given 2 statements. If the `prevNode` has trailing comments, it inserts a blank line after
 * the trailing comments.
 *
 * @param context The rule context to report.
 * @param prevNode The previous node to check.
 * @param nextNode The next node to check.
 * @param paddingLines The array of token pairs that blank lines exist between the pair.
 */
function verifyForAlways(
  context: RuleContext,
  prevNode: ASTNode,
  nextNode: ASTNode,
  paddingLines: Array<[Token, Token]>
): void {
  if (paddingLines.length > 0) return

  context.report({
    fix(fixer) {
      const sourceCode = context.sourceCode
      let prevToken = getActualLastToken(prevNode, sourceCode)

      const nextToken =
        sourceCode.getFirstTokenBetween(prevToken, nextNode, {
          includeComments: true,

          /**
           * Skip the trailing comments of the previous node. This inserts a blank line after the
           * last trailing comment.
           *
           * For example:
           *
           *     foo() // trailing comment.
           *     // comment.
           *     bar()
           *
           * Get fixed to:
           *
           *     foo() // trailing comment.
           *
           *     // comment.
           *     bar()
           *
           * @param token The token to check.
           *
           * @returns `true` if the token is not a trailing comment.
           */
          filter(token) {
            if (isTokenOnSameLine(prevToken, token)) {
              prevToken = token

              return false
            }

            return true
          },
        }) ?? nextNode

      const insertText = isTokenOnSameLine(prevToken, nextToken) ? "\n\n" : "\n"

      return fixer.insertTextAfter(prevToken, insertText)
    },
    loc: getReportLoc(nextNode, context.sourceCode),
    messageId: "expectedBlankLine",
    node: nextNode,
  })
}

/**
 * Types of blank lines. `any`, `never`, and `always` are defined. Those have `verify` method to
 * check and report statements.
 */
const PaddingTypes = {
  always: { verify: verifyForAlways },
  any: { verify: verifyForAny },
  never: { verify: verifyForNever },
}

const MaybeMultilineStatementType = {
  "block-like": { test: isBlockLikeStatement },
  const: newKeywordTester("VariableDeclaration", "const"),
  export: newKeywordTester(
    ["ExportAllDeclaration", "ExportDefaultDeclaration", "ExportNamedDeclaration"],
    "export"
  ),
  expression: { test: isExpression },
  let: newKeywordTester("VariableDeclaration", "let"),
  return: newKeywordTester("ReturnStatement", "return"),
  type: newKeywordTester("TSTypeAliasDeclaration", "type"),
  using: {
    test: (node) =>
      node.type === "VariableDeclaration" && (node.kind === "using" || node.kind === "await using"),
  },
  var: newKeywordTester("VariableDeclaration", "var"),
} satisfies Record<string, NodeTestObject>

/**
 * Statement types that match one statement kind each.
 */
const BaseStatementTypes = {
  "*": { test: (): boolean => true },
  block: newNodeTypeTester("BlockStatement"),
  break: newKeywordTester("BreakStatement", "break"),
  case: newKeywordTester("SwitchCase", "case"),
  "cjs-export": {
    test: (node, sourceCode) =>
      node.type === "ExpressionStatement"
      && node.expression.type === "AssignmentExpression"
      && CJS_EXPORT.test(sourceCode.getText(node.expression.left)),
  },
  "cjs-import": {
    test: (node, sourceCode) => {
      if (node.type !== "VariableDeclaration") return false
      const init = node.declarations[0]?.init

      return init ? sourceCode.getText(init).startsWith("require(") : false
    },
  },
  class: newKeywordTester("ClassDeclaration", "class"),
  continue: newKeywordTester("ContinueStatement", "continue"),
  debugger: newKeywordTester("DebuggerStatement", "debugger"),
  default: newKeywordTester(["SwitchCase", "ExportDefaultDeclaration"], "default"),
  directive: { test: isDirectivePrologue },
  do: newKeywordTester("DoWhileStatement", "do"),
  empty: newNodeTypeTester("EmptyStatement"),
  enum: newKeywordTester("TSEnumDeclaration", "enum"),
  exports: { test: isCJSExport },
  for: newKeywordTester(["ForStatement", "ForInStatement", "ForOfStatement"], "for"),
  function: newNodeTypeTester("FunctionDeclaration"),
  "function-overload": newNodeTypeTester("TSDeclareFunction"),
  if: newKeywordTester("IfStatement", "if"),
  iife: { test: isIIFEStatement },
  import: newKeywordTester("ImportDeclaration", "import"),
  interface: newKeywordTester("TSInterfaceDeclaration", "interface"),
  require: { test: isCJSRequire },
  switch: newKeywordTester("SwitchStatement", "switch"),
  throw: newKeywordTester("ThrowStatement", "throw"),
  try: newKeywordTester("TryStatement", "try"),
  "ts-method": newNodeTypeTester("TSMethodSignature"),
  while: newKeywordTester(["WhileStatement", "DoWhileStatement"], "while"),
  with: newKeywordTester("WithStatement", "with"),
} satisfies Record<string, NodeTestObject>

/**
 * Types of statements. Those have `test` method to check it matches to the given statement. Each
 * type that can span lines also has a `singleline-` and a `multiline-` form.
 */
const StatementTypes = new Map<string, NodeTestObject>([
  ...Object.entries(BaseStatementTypes),
  ...Object.entries(MaybeMultilineStatementType).flatMap(
    ([key, value]): Array<[string, NodeTestObject]> => [
      [key, value],
      [
        `singleline-${key}`,
        {
          test: (node, sourceCode) =>
            value.test(node, sourceCode) && isSingleLine(node, sourceCode),
        },
      ],
      [
        `multiline-${key}`,
        {
          test: (node, sourceCode) =>
            value.test(node, sourceCode) && !isSingleLine(node, sourceCode),
        },
      ],
    ]
  ),
])

/**
 * Build the vendored padding rule with caller-owned, typed policy options. `statementTypes`
 * registers caller-defined statement types, looked up before the upstream table, for syntax the
 * upstream matchers do not distinguish.
 */
export default function createPaddingLineRule<Extra extends string = never>(
  options: PolicyOptions<NoInfer<Extra>>,
  statementTypes?: Record<Extra, NodeTestObject>
): CreateRule {
  const customStatementTypes: Partial<Record<string, NodeTestObject>> = statementTypes ?? {}

  return {
    create(context) {
      const sourceCode = context.sourceCode

      const selectorMatchedNodes = new Map<string, Set<ASTNode>>()
      const pendingPairs: Array<{ prevNode: ASTNode; nextNode: ASTNode }> = []

      function collectSelectorOption(option: PolicyStatementOption<Extra>): void {
        if (Array.isArray(option)) {
          for (const item of option) collectSelectorOption(item)

          return
        }

        if (!isSelectorOption(option)) return

        selectorMatchedNodes.set(option.selector, new Set())
      }

      for (const configure of options) {
        collectSelectorOption(configure.prev)
        collectSelectorOption(configure.next)
      }

      type Scope = {
        upper: Scope
        prevNode: ASTNode | null
      } | null

      let scopeInfo: Scope = null

      /**
       * Processes to enter to new scope. This manages the current previous statement.
       */
      function enterScope(): void {
        scopeInfo = {
          prevNode: null,
          upper: scopeInfo,
        }
      }

      /**
       * Processes to exit from the current scope.
       */
      function exitScope(): void {
        if (scopeInfo) scopeInfo = scopeInfo.upper
      }

      /**
       * Checks whether the given node matches the given type.
       *
       * @param node The statement node to check.
       * @param type The statement type to check.
       *
       * @returns `true` if the statement node matched the type.
       */
      function match(node: ASTNode, type: PolicyStatementOption<Extra>): boolean {
        let innerStatementNode = node

        while (innerStatementNode.type === "LabeledStatement")
          innerStatementNode = innerStatementNode.body

        if (Array.isArray(type)) return type.some(match.bind(null, innerStatementNode))

        if (isSelectorOption(type)) {
          const matchedNodes = selectorMatchedNodes.get(type.selector)

          if (!matchedNodes?.has(innerStatementNode)) return false

          const lineMode = type.lineMode

          if (lineMode === "singleline") return isSingleLine(innerStatementNode, sourceCode)
          else if (lineMode === "multiline") return !isSingleLine(innerStatementNode, sourceCode)

          return true
        }

        const statementType = customStatementTypes[type] ?? StatementTypes.get(type)

        if (statementType === undefined)
          throw new Error(`Padding rule invariant: unsupported statement type ${type}`)

        return statementType.test(innerStatementNode, sourceCode)
      }

      /**
       * Finds the last matched configure from options.
       *
       * @param prevNode The previous statement to match.
       * @param nextNode The current statement to match.
       *
       * @returns The tester of the last matched configure.
       */
      function getPaddingType(
        prevNode: ASTNode,
        nextNode: ASTNode
      ): (typeof PaddingTypes)[keyof typeof PaddingTypes] {
        let blankLine: PaddingType = "any"

        for (const entry of options) {
          if (match(prevNode, entry.prev) && match(nextNode, entry.next))
            blankLine = entry.blankLine
        }

        return PaddingTypes[blankLine]
      }

      /**
       * Gets padding line sequences between the given 2 statements. Comments are separators of the
       * padding line sequences.
       *
       * @param prevNode The previous statement to count.
       * @param nextNode The current statement to count.
       *
       * @returns The array of token pairs.
       */
      function getPaddingLineSequences(
        prevNode: ASTNode,
        nextNode: ASTNode
      ): Array<[Token, Token]> {
        const pairs: Array<[Token, Token]> = []
        let prevToken: Token = getActualLastToken(prevNode, sourceCode)

        if (nextNode.loc.start.line - prevToken.loc.end.line >= 2) {
          do {
            const token = sourceCode.getTokenAfter(prevToken, { includeComments: true })

            if (token === null)
              throw new Error("Padding rule invariant: token before the next statement is missing")

            if (token.loc.start.line - prevToken.loc.end.line >= 2) pairs.push([prevToken, token])

            prevToken = token
          } while (prevToken.range[0] < nextNode.range[0])
        }

        return pairs
      }

      /**
       * Verify padding lines between the given node and the previous node.
       *
       * @param node The node to verify.
       */
      function verify(node: ASTNode): void {
        if (
          !node.parent
          || ![
            "BlockStatement",
            "Program",
            "StaticBlock",
            "SwitchCase",
            "SwitchStatement",
            "TSInterfaceBody",
            "TSModuleBlock",
            "TSTypeLiteral",
          ].includes(node.parent.type)
        ) {
          return
        }

        if (scopeInfo === null) throw new Error("Padding rule invariant: statement outside a scope")

        // Save this node as the current previous statement.
        const prevNode = scopeInfo.prevNode

        // Verify.
        if (prevNode) pendingPairs.push({ nextNode: node, prevNode })

        scopeInfo.prevNode = node
      }

      function verifyPendingPairs(): void {
        for (const { prevNode, nextNode } of pendingPairs) {
          const type = getPaddingType(prevNode, nextNode)
          const paddingLines = getPaddingLineSequences(prevNode, nextNode)

          type.verify(context, prevNode, nextNode, paddingLines)
        }
      }

      /**
       * Verify padding lines between the given node and the previous node. Then process to enter to
       * new scope.
       *
       * @param node The node to verify.
       */
      function verifyThenEnterScope(node: ASTNode): void {
        verify(node)
        enterScope()
      }

      const selectorMatchListeners = Object.fromEntries(
        Array.from(selectorMatchedNodes.keys(), (selector) => [
          selector,
          (node: ASTNode): void => {
            selectorMatchedNodes.get(selector)?.add(node)
          },
        ])
      )

      return {
        ":statement": verify,
        BlockStatement: enterScope,
        "BlockStatement:exit": exitScope,
        Program: enterScope,
        "Program:exit": () => {
          verifyPendingPairs()
          exitScope()
        },
        StaticBlock: enterScope,
        "StaticBlock:exit": exitScope,
        SwitchCase: verifyThenEnterScope,
        "SwitchCase:exit": exitScope,
        SwitchStatement: enterScope,
        "SwitchStatement:exit": exitScope,
        TSDeclareFunction: verifyThenEnterScope,
        "TSDeclareFunction:exit": exitScope,
        TSInterfaceBody: enterScope,
        "TSInterfaceBody:exit": exitScope,
        TSMethodSignature: verifyThenEnterScope,
        "TSMethodSignature:exit": exitScope,
        TSModuleBlock: enterScope,
        "TSModuleBlock:exit": exitScope,
        TSTypeLiteral: enterScope,
        "TSTypeLiteral:exit": exitScope,
        ...selectorMatchListeners,
      }
    },
    meta: {
      fixable: "whitespace",
      messages: {
        expectedBlankLine: "Expected blank line before this statement.",
        unexpectedBlankLine: "Unexpected blank line before this statement.",
      },
      type: "layout",
    },
  }
}
