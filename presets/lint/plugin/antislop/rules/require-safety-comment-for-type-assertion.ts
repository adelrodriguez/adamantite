import type { ESTree, Rule, SourceCode } from "@oxlint/plugins"
import { readStringArrayOption } from "../../options.ts"

type TypeAssertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion

const DEFAULT_SAFETY_MARKERS = ["SAFETY"] as const

// Node kinds that own a comment like a statement does, although their names do not end in
// `Statement` or `Declaration`.
const statementLikeKinds = new Set(["AccessorProperty", "PropertyDefinition", "TSExportAssignment"])

// A declaration in one of these heads is part of the loop statement, so the comment above the loop
// covers it.
const loopHeadKinds = new Set(["ForInStatement", "ForOfStatement", "ForStatement"])

/**
 * Reports whether a node is the statement that owns the comments above an assertion.
 */
function isCommentOwner(node: ESTree.Node): boolean {
  if (node.type === "VariableDeclaration" && loopHeadKinds.has(node.parent.type)) return false

  return statementLikeKinds.has(node.type) || /(?:Declaration|Statement)$/u.test(node.type)
}

function isConstAssertion(node: TypeAssertion): boolean {
  return (
    node.typeAnnotation.type === "TSTypeReference"
    && node.typeAnnotation.typeName.type === "Identifier"
    && node.typeAnnotation.typeName.name === "const"
  )
}

function configuredSafetyMarkers(configured: readonly string[] = []): readonly string[] {
  const markers = configured.flatMap((marker) => (marker.trim().length > 0 ? [marker.trim()] : []))

  return markers.length > 0 ? markers : DEFAULT_SAFETY_MARKERS
}

function markerPattern(markers: readonly string[]): RegExp {
  const alternation = markers
    .map((marker) => marker.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`))
    .join("|")

  return new RegExp(String.raw`(?:^|[^\p{L}\p{N}_])(?:${alternation})\s*:\s*\S`, "u")
}

/**
 * Reports whether a comment before the statement ends a line of earlier code, such as `const a = 1
 * // SAFETY: ...`. That comment describes the earlier code.
 */
function isTrailingComment(
  sourceCode: SourceCode,
  comment: ESTree.Comment,
  statement: ESTree.Node
): boolean {
  if (comment.start >= statement.start) return false
  const previous = sourceCode.getTokenBefore(comment)

  return previous !== null && previous.loc.end.line === comment.loc.start.line
}

function hasSafetyComment(sourceCode: SourceCode, node: TypeAssertion, pattern: RegExp): boolean {
  const owners: ESTree.Node[] = [node]
  let statement: ESTree.Node = node

  while (!isCommentOwner(statement) && statement.parent.type !== "Program") {
    statement = statement.parent
    owners.push(statement)
  }

  const exportDeclaration = statement.parent

  if (
    exportDeclaration.type === "ExportNamedDeclaration"
    && exportDeclaration.declaration === statement
  ) {
    statement = exportDeclaration
    owners.push(statement)
  }

  return owners.some((owner) =>
    sourceCode
      .getCommentsBefore(owner)
      .some(
        (comment) =>
          comment.end <= node.start
          && pattern.test(comment.value)
          && !isTrailingComment(sourceCode, comment, statement)
      )
  )
}

/**
 * Require every non-const type assertion to state the invariant TypeScript cannot express.
 */
const rule: Rule = {
  createOnce(context) {
    const patterns = new Map<string, RegExp>()

    const checkAssertion = (node: TypeAssertion) => {
      if (isConstAssertion(node)) return
      const markers = configuredSafetyMarkers(readStringArrayOption(context.options, "markers"))
      const patternKey = markers.join("\u0000")
      const pattern = patterns.get(patternKey) ?? markerPattern(markers)
      patterns.set(patternKey, pattern)

      if (hasSafetyComment(context.sourceCode, node, pattern)) return
      context.report({
        data: { marker: markers[0] ?? DEFAULT_SAFETY_MARKERS[0] },
        messageId: "missingSafetyComment",
        node,
      })
    }

    return {
      TSAsExpression: checkAssertion,
      TSTypeAssertion: checkAssertion,
    }
  },
  meta: {
    defaultOptions: [{ markers: ["SAFETY"] }],
    docs: {
      description:
        "Require a nearby SAFETY comment for every TypeScript type assertion except const assertions.",
    },
    messages: {
      missingSafetyComment:
        "This type assertion has no `{{marker}}:` justification. State the checked invariant immediately before the assertion or its containing statement.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          markers: {
            items: { minLength: 1, type: "string" },
            minItems: 1,
            type: "array",
            uniqueItems: true,
          },
        },
        type: "object",
      },
    ],
    type: "problem",
  },
}

export default rule
