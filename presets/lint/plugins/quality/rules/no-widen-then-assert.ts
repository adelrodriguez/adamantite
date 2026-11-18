import type { ESTree, Reference, Rule, Variable } from "@oxlint/plugins"

import { namedTypeReference } from "../shared/type-alias-resolution.ts"

type Assertion = ESTree.TSAsExpression | ESTree.TSTypeAssertion

type BroadTypeKind = "top" | "object" | "record"

type KnownValueEvidence = {
  readonly type: ESTree.TSType | null
}

const functionBoundaryTypes = new Set([
  "ArrowFunctionExpression",
  "FunctionDeclaration",
  "FunctionExpression",
  "TSDeclareFunction",
  "TSEmptyBodyFunctionExpression",
])

function unwrapExpressionParentheses(expression: ESTree.Expression): ESTree.Expression {
  let current = expression

  while (current.type === "ParenthesizedExpression") {
    current = current.expression
  }

  return current
}

function unwrapTypeParentheses(type: ESTree.TSType): ESTree.TSType {
  let current = type

  while (current.type === "TSParenthesizedType") {
    current = current.typeAnnotation
  }

  return current
}

/**
 * Return the name of a type reference, as `Record` in `Record<K, V>` or `globalThis.Record<K, V>`.
 */
function typeReferenceName(type: ESTree.TSTypeReference): string | null {
  return namedTypeReference(type)?.name ?? null
}

function isUnknownOrAnyType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type)

  return unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword"
}

function isBroadRecordKeyType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type)

  if (
    unwrapped.type === "TSStringKeyword"
    || unwrapped.type === "TSNumberKeyword"
    || unwrapped.type === "TSSymbolKeyword"
  ) {
    return true
  }

  if (unwrapped.type === "TSUnionType") {
    return unwrapped.types.every(isBroadRecordKeyType)
  }

  return unwrapped.type === "TSTypeReference" && typeReferenceName(unwrapped) === "PropertyKey"
}

function isBroadRecordType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type)

  if (unwrapped.type === "TSTypeReference") {
    if (typeReferenceName(unwrapped) === "Readonly") {
      const [inner] = unwrapped.typeArguments?.params ?? []

      return inner !== undefined && isBroadRecordType(inner)
    }

    if (typeReferenceName(unwrapped) !== "Record") {
      return false
    }

    const parameters = unwrapped.typeArguments?.params ?? []

    return (
      parameters.length === 2
      && parameters[0] !== undefined
      && parameters[1] !== undefined
      && isBroadRecordKeyType(parameters[0])
      && isUnknownOrAnyType(parameters[1])
    )
  }

  if (unwrapped.type !== "TSTypeLiteral" || unwrapped.members.length !== 1) {
    return false
  }

  const [member] = unwrapped.members
  const [parameter] = member?.type === "TSIndexSignature" ? member.parameters : []

  return (
    member?.type === "TSIndexSignature"
    && member.parameters.length === 1
    && parameter !== undefined
    && isBroadRecordKeyType(parameter.typeAnnotation.typeAnnotation)
    && isUnknownOrAnyType(member.typeAnnotation.typeAnnotation)
  )
}

function broadTypeKind(type: ESTree.TSType): BroadTypeKind | null {
  const unwrapped = unwrapTypeParentheses(type)

  if (unwrapped.type === "TSUnknownKeyword" || unwrapped.type === "TSAnyKeyword") {
    return "top"
  }

  if (unwrapped.type === "TSObjectKeyword") {
    return "object"
  }

  return isBroadRecordType(unwrapped) ? "record" : null
}

function assertedExpression(
  node: ESTree.TSAsExpression | ESTree.TSTypeAssertion
): ESTree.Expression {
  return unwrapExpressionParentheses(node.expression)
}

function assertionFromExpression(
  expression: ESTree.Expression
): ESTree.TSAsExpression | ESTree.TSTypeAssertion | null {
  const unwrapped = unwrapExpressionParentheses(expression)

  return unwrapped.type === "TSAsExpression" || unwrapped.type === "TSTypeAssertion"
    ? unwrapped
    : null
}

function normalizedTypeText(sourceText: string, type: ESTree.TSType): string {
  return sourceText.slice(type.start, type.end).replaceAll(/\s+/gu, "")
}

function typesHaveSameSyntax(
  sourceText: string,
  left: ESTree.TSType | null,
  right: ESTree.TSType
): boolean {
  return (
    left !== null
    && normalizedTypeText(sourceText, unwrapTypeParentheses(left))
      === normalizedTypeText(sourceText, unwrapTypeParentheses(right))
  )
}

function isDefinitelyObjectType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type)

  switch (unwrapped.type) {
    case "TSArrayType":
    case "TSConstructorType":
    case "TSFunctionType":
    case "TSMappedType":
    case "TSObjectKeyword":
    case "TSTupleType":
      return true
    case "TSTypeLiteral":
      return unwrapped.members.length > 0
    case "TSIntersectionType":
      return unwrapped.types.every(isDefinitelyObjectType)
    case "TSTypeOperator":
      return unwrapped.operator === "readonly" && isDefinitelyObjectType(unwrapped.typeAnnotation)
    default:
      return false
  }
}

function isDefinitelyNarrowerRecordType(type: ESTree.TSType): boolean {
  const unwrapped = unwrapTypeParentheses(type)

  if (unwrapped.type === "TSTypeLiteral") {
    return unwrapped.members.some((member) => member.type !== "TSIndexSignature")
  }

  if (unwrapped.type !== "TSTypeReference") {
    return false
  }

  if (typeReferenceName(unwrapped) === "Readonly") {
    const [inner] = unwrapped.typeArguments?.params ?? []

    return inner !== undefined && isDefinitelyNarrowerRecordType(inner)
  }

  if (typeReferenceName(unwrapped) !== "Record") {
    return false
  }

  const parameters = unwrapped.typeArguments?.params ?? []

  return (
    parameters.length === 2 && parameters[1] !== undefined && !isUnknownOrAnyType(parameters[1])
  )
}

function functionBoundary(node: ESTree.Node): ESTree.Node | null {
  let current = node.parent

  while (current !== null && current.type !== "Program") {
    if (functionBoundaryTypes.has(current.type)) {
      return current
    }

    current = current.parent
  }

  return null
}

/**
 * Reports whether a node is inside a function boundary, or anywhere in the file when the boundary
 * is the module. A nested function sees the same value of a const binding that has no writes.
 */
function isInsideBoundary(node: ESTree.Node, boundary: ESTree.Node | null): boolean {
  return boundary === null || (node.start >= boundary.start && node.end <= boundary.end)
}

/**
 * Resolve an identifier reference to the variable that it reads.
 */
type Resolve = (identifier: ESTree.IdentifierReference) => Variable | null

function variableDeclarator(variable: Variable): ESTree.VariableDeclarator | null {
  for (const definition of variable.defs) {
    if (definition.type === "Variable" && definition.node.type === "VariableDeclarator") {
      return definition.node
    }
  }

  return null
}

function knownValueEvidence(
  expression: ESTree.Expression,
  resolve: Resolve,
  boundary: ESTree.Node | null,
  visitedVariables: ReadonlySet<Variable>
): KnownValueEvidence | null {
  const unwrapped = unwrapExpressionParentheses(expression)

  if (unwrapped.type === "TSAsExpression" || unwrapped.type === "TSTypeAssertion") {
    if (broadTypeKind(unwrapped.typeAnnotation) !== null) {
      return null
    }

    return { type: unwrapped.typeAnnotation }
  }

  if (unwrapped.type === "Literal" || unwrapped.type === "TemplateLiteral") {
    return { type: null }
  }

  if (
    unwrapped.type === "ArrayExpression"
    || unwrapped.type === "ArrowFunctionExpression"
    || unwrapped.type === "ClassExpression"
    || unwrapped.type === "FunctionExpression"
    || unwrapped.type === "NewExpression"
    || unwrapped.type === "ObjectExpression"
  ) {
    return { type: null }
  }

  if (unwrapped.type !== "Identifier") {
    return null
  }

  const variable = resolve(unwrapped)

  if (variable === null || visitedVariables.has(variable)) {
    return null
  }

  const annotatedIdentifier = variable.identifiers.find(
    (identifier) => identifier.typeAnnotation !== null && identifier.typeAnnotation !== undefined
  )

  const annotation = annotatedIdentifier?.typeAnnotation?.typeAnnotation

  if (annotation !== undefined && annotatedIdentifier !== undefined) {
    if (functionBoundary(annotatedIdentifier) !== boundary || broadTypeKind(annotation) !== null) {
      return null
    }

    return { type: annotation }
  }

  const declarator = variableDeclarator(variable)

  if (
    declarator?.parent.type !== "VariableDeclaration"
    || declarator.parent.kind !== "const"
    || declarator.init === null
    || variable.references.some((reference) => reference.isWrite() && !reference.init)
    || functionBoundary(declarator) !== boundary
  ) {
    return null
  }

  return knownValueEvidence(
    declarator.init,
    resolve,
    boundary,
    new Set([...visitedVariables, variable])
  )
}

function widenedBinding(
  variable: Variable,
  resolve: Resolve
): {
  readonly broadKind: BroadTypeKind
  readonly evidence: KnownValueEvidence
  readonly declaredAt: number
  readonly boundary: ESTree.Node | null
} | null {
  const declarator = variableDeclarator(variable)

  if (
    declarator?.parent.type !== "VariableDeclaration"
    || declarator.parent.kind !== "const"
    || declarator.id.type !== "Identifier"
    || declarator.init === null
    || variable.references.some((reference) => reference.isWrite() && !reference.init)
  ) {
    return null
  }

  const boundary = functionBoundary(declarator)
  const declaredType = declarator.id.typeAnnotation?.typeAnnotation
  const initializerAssertion = assertionFromExpression(declarator.init)

  const initializerBroadKind =
    initializerAssertion === null ? null : broadTypeKind(initializerAssertion.typeAnnotation)

  const declaredBroadKind = declaredType === undefined ? null : broadTypeKind(declaredType)
  const broadKind = declaredBroadKind ?? initializerBroadKind

  if (broadKind === null) {
    return null
  }

  const originalExpression =
    initializerAssertion !== null && initializerBroadKind !== null
      ? assertedExpression(initializerAssertion)
      : declarator.init

  const evidence = knownValueEvidence(originalExpression, resolve, boundary, new Set([variable]))

  return evidence === null ? null : { boundary, broadKind, declaredAt: declarator.end, evidence }
}

function assertionIsNarrower(
  sourceText: string,
  broadKind: BroadTypeKind,
  evidence: KnownValueEvidence,
  assertedType: ESTree.TSType
): boolean {
  if (broadTypeKind(assertedType) !== null) {
    return false
  }

  if (broadKind === "top") {
    return true
  }

  if (typesHaveSameSyntax(sourceText, evidence.type, assertedType)) {
    return true
  }

  if (broadKind === "object") {
    return isDefinitelyObjectType(assertedType)
  }

  return isDefinitelyNarrowerRecordType(assertedType)
}

/**
 * Detect immutable local bindings that erase a known type and are later asserted back to a narrower
 * type.
 */
const rule: Rule = {
  createOnce(context) {
    // The rule checks an assertion only when its identifier names a `const` binding that widens
    // its value, so most files never build the scope analysis that resolves references.
    const candidates: Array<{
      readonly expression: ESTree.IdentifierReference
      readonly node: Assertion
    }> = []

    const widenedNames = new Set<string>()
    let references: Map<number, Reference> | null = null

    const resolve: Resolve = (identifier) => {
      if (references === null) {
        references = new Map()

        for (const scope of context.sourceCode.scopeManager.scopes) {
          for (const reference of scope.references) {
            if (!references.has(reference.identifier.start)) {
              references.set(reference.identifier.start, reference)
            }
          }
        }
      }

      const reference = references.get(identifier.start)

      return reference?.identifier.end === identifier.end ? reference.resolved : null
    }

    const checkAssertion = (node: Assertion, expression: ESTree.IdentifierReference) => {
      const variable = resolve(expression)

      if (variable === null) {
        return
      }

      const widened = widenedBinding(variable, resolve)

      if (
        widened === null
        || node.start <= widened.declaredAt
        || !isInsideBoundary(node, widened.boundary)
        || !assertionIsNarrower(
          context.sourceCode.text,
          widened.broadKind,
          widened.evidence,
          node.typeAnnotation
        )
      ) {
        return
      }

      context.report({
        data: { name: expression.name },
        messageId: "widenThenAssert",
        node,
      })
    }

    const collectAssertion = (node: Assertion) => {
      const expression = assertedExpression(node)

      if (expression.type === "Identifier") {
        candidates.push({ expression, node })
      }
    }

    return {
      Program() {
        candidates.length = 0
        widenedNames.clear()
        references = null
      },
      "Program:exit"() {
        for (const { expression, node } of candidates) {
          if (widenedNames.has(expression.name)) {
            checkAssertion(node, expression)
          }
        }

        candidates.length = 0
        references = null
      },
      TSAsExpression: collectAssertion,
      TSTypeAssertion: collectAssertion,
      VariableDeclarator(node) {
        if (
          node.parent.type !== "VariableDeclaration"
          || node.parent.kind !== "const"
          || node.id.type !== "Identifier"
          || node.init === null
        ) {
          return
        }

        const declaredType = node.id.typeAnnotation?.typeAnnotation
        const initializerType = assertionFromExpression(node.init)?.typeAnnotation

        if (
          (declaredType !== undefined && broadTypeKind(declaredType) !== null)
          || (initializerType !== undefined && broadTypeKind(initializerType) !== null)
        ) {
          widenedNames.add(node.id.name)
        }
      },
    }
  },
  meta: {
    docs: {
      description:
        "Disallow local const flows that explicitly widen a known value before asserting the widened binding to a narrower type.",
    },
    messages: {
      widenThenAssert:
        'Binding "{{name}}" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use, and parse boundary input once. If a test passes input of the wrong type on purpose, pass it without an assertion and put `// @ts-expect-error -- reason` above the call.',
    },
    type: "problem",
  },
}

export default rule
