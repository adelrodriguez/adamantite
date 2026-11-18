import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"

import { readPositiveIntegerOption } from "../../shared/options.ts"
import { fitsOnOneLine } from "../stylistic/padding-line-ast.ts"
import createPaddingLineRule from "../stylistic/padding-line-between-statements.ts"

import type { NodeTestObject } from "../stylistic/padding-line-between-statements.ts"

/**
 * The `printWidth` of Oxfmt and of the format preset.
 */
export const DEFAULT_PRINT_WIDTH = 100

/**
 * A `const`/`let`/`var`/`using` declaration, optionally exported, that stays on one line after
 * formatting. The semicolon-less style's semicolon on the next line, as in `;[a, b].forEach(f)`,
 * does not count.
 */
function isSinglelineBinding(
  node: ESTree.Node,
  sourceCode: SourceCode,
  printWidth: number
): boolean {
  const declaration = node.type === "ExportNamedDeclaration" ? node.declaration : node

  return declaration?.type === "VariableDeclaration" && fitsOnOneLine(node, sourceCode, printWidth)
}

/**
 * Comments above a statement belong to it; a comment trailing the previous line does not.
 */
function hasLeadingComment(node: ESTree.Node, sourceCode: SourceCode): boolean {
  const previousLine = sourceCode.getTokenBefore(node)?.loc.end.line

  return sourceCode
    .getCommentsBefore(node)
    .some((comment) => comment.loc.start.line !== previousLine)
}

const singlelineBinding: NodeTestObject = {
  test: (node, sourceCode, printWidth) => isSinglelineBinding(node, sourceCode, printWidth),
}

const undocumentedSinglelineBinding: NodeTestObject = {
  test: (node, sourceCode, printWidth) =>
    isSinglelineBinding(node, sourceCode, printWidth) && !hasLeadingComment(node, sourceCode),
}

const paddingRule = createPaddingLineRule(
  [
    { blankLine: "always", next: "*", prev: "import" },
    { blankLine: "always", next: { selector: "Program > :not(ImportDeclaration)" }, prev: "*" },
    { blankLine: "always", next: "*", prev: { selector: "Program > :not(ImportDeclaration)" } },
    { blankLine: "always", next: ["function", "class", "interface", "type"], prev: "*" },
    { blankLine: "always", next: "*", prev: ["function", "class", "interface", "type"] },
    {
      blankLine: "always",
      next: ["multiline-const", "multiline-let", "multiline-var", "multiline-using"],
      prev: "*",
    },
    {
      blankLine: "always",
      next: "*",
      prev: ["multiline-const", "multiline-let", "multiline-var", "multiline-using"],
    },
    {
      blankLine: "always",
      next: ["return", "if", "switch", "try", "for", "while", "do"],
      prev: "*",
    },
    { blankLine: "always", next: "*", prev: "block-like" },
    { blankLine: "any", next: "import", prev: "import" },
    // Consecutive single-line bindings form one group at any scope, including
    // module scope. A binding with its own leading comment starts a new group.
    { blankLine: "any", next: "undocumented-singleline-binding", prev: "singleline-binding" },
    {
      blankLine: "any",
      next: {
        selector:
          ':matches(TSDeclareFunction, FunctionDeclaration, ExportNamedDeclaration[declaration.type="TSDeclareFunction"], ExportNamedDeclaration[declaration.type="FunctionDeclaration"])',
      },
      prev: {
        selector:
          ':matches(TSDeclareFunction, ExportNamedDeclaration[declaration.type="TSDeclareFunction"])',
      },
    },
  ],
  {
    "singleline-binding": singlelineBinding,
    "undocumented-singleline-binding": undocumentedSinglelineBinding,
  },
  (context) => readPositiveIntegerOption(context.options, "printWidth") ?? DEFAULT_PRINT_WIDTH
)

/**
 * Restore structural blank lines with whitespace-only fixes; keep single-line binding groups and
 * overloads grouped.
 *
 * `fix` runs lint before Oxfmt, so the rule predicts the lines that Oxfmt writes. A statement on
 * one line that ends past `printWidth` counts as multiline, because Oxfmt wraps it. If Oxfmt keeps
 * that line, as for a long template literal, the statement only gets blank lines that the policy
 * allows. The rule measures the line as written, so it can still miss a wrap when Oxfmt makes the
 * line longer, for example when it changes `{a:1}` to `{ a: 1 }`, indents the line deeper, or
 * expands tabs.
 */
const rule: Rule = {
  ...paddingRule,
  meta: {
    ...paddingRule.meta,
    docs: {
      description: "Require readable spacing between declarations and logical statement groups.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          printWidth: { minimum: 1, type: "integer" },
        },
        type: "object",
      },
    ],
  },
}

export default rule
