import type { ESTree, Reference, Rule, SourceCode } from "@oxlint/plugins"

import {
  containsUnknownType,
  type FunctionParameter,
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from "../shared/function-parameters.ts"
import { resolveVariable } from "../shared/scope.ts"

type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature

type RuntimeFunction = ESTree.ArrowFunctionExpression | ESTree.Function

type ReferenceIdentifier = Reference["identifier"]

function isRuntimeFunction(node: ESTree.Node): node is RuntimeFunction {
  return (
    node.type === "ArrowFunctionExpression"
    || node.type === "FunctionDeclaration"
    || node.type === "FunctionExpression"
  )
}

/**
 * Return the identifier that a plain or defaulted parameter binds, or null for a pattern.
 */
function parameterIdentifier(parameter: FunctionParameter): ESTree.BindingIdentifier | null {
  const binding = parameter.type === "AssignmentPattern" ? parameter.left : parameter

  return binding.type === "Identifier" ? binding : null
}

function isTypePredicateSubject(owner: ParameterOwner, parameterName: string): boolean {
  const predicate = owner.returnType?.typeAnnotation

  return (
    predicate?.type === "TSTypePredicate"
    && predicate.parameterName.type === "Identifier"
    && predicate.parameterName.name === parameterName
  )
}

/**
 * The argument position of the rejection callback for each promise method that takes one.
 */
const REJECTION_CALLBACK_INDEX = new Map([
  ["catch", 0],
  ["then", 1],
])

/**
 * Return whether a function is the rejection callback of `.catch()` or `.then()`. The promise fixes
 * the type of the rejection reason, so the callback cannot accept a parsed domain type.
 */
function isRejectionCallback(owner: ParameterOwner): boolean {
  const call = owner.parent

  if (call.type !== "CallExpression") return false
  const callee = call.callee

  if (callee.type !== "MemberExpression" || callee.computed) return false

  if (callee.property.type !== "Identifier") return false
  const index = REJECTION_CALLBACK_INDEX.get(callee.property.name)

  return index !== undefined && call.arguments[index] === owner
}

/**
 * Parser names and how a call reaches them. A `method` parses its arguments, as in
 * `schema.parse(value)`. A `factory` returns a parser, as in
 * `Schema.decodeUnknownSync(User)(value)`.
 */
const PARSERS = new Map<string, "factory" | "method">([
  ["parse", "method"],
  ["safeParse", "method"],
  ["parseAsync", "method"],
  ["safeParseAsync", "method"],
  ["decode", "method"],
  ["safeDecode", "method"],
  ["validate", "method"],
  ["decodeUnknown", "factory"],
  ["decodeUnknownSync", "factory"],
  ["decodeUnknownEither", "factory"],
  ["decodeUnknownOption", "factory"],
  ["decodeUnknownPromise", "factory"],
  ["decodeUnknownExit", "factory"],
  ["is", "factory"],
  ["asserts", "factory"],
])

function memberParser(callee: ESTree.Node): "factory" | "method" | undefined {
  if (callee.type !== "MemberExpression" || callee.computed) return undefined

  return callee.property.type === "Identifier" ? PARSERS.get(callee.property.name) : undefined
}

function isParserFactoryCall(node: ESTree.Node | null): boolean {
  return node?.type === "CallExpression" && memberParser(node.callee) === "factory"
}

/**
 * Return whether an identifier names a `const` binding that holds a parser from a factory, as in
 * `const decode = Schema.decodeUnknownSync(User)`.
 */
function isParserConstant(callee: ESTree.IdentifierReference, sourceCode: SourceCode): boolean {
  const definition = resolveVariable(sourceCode, callee)?.defs[0]
  const declarator = definition?.node

  return (
    declarator?.type === "VariableDeclarator"
    && declarator.parent.type === "VariableDeclaration"
    && declarator.parent.kind === "const"
    && isParserFactoryCall(declarator.init)
  )
}

function isParserCall(call: ESTree.CallExpression, sourceCode: SourceCode): boolean {
  const callee = call.callee

  if (callee.type === "Identifier") return isParserConstant(callee, sourceCode)

  return memberParser(callee) === "method" || isParserFactoryCall(callee)
}

function isInstanceofSubject(test: ESTree.Node, name: string): boolean {
  return (
    test.type === "BinaryExpression"
    && test.operator === "instanceof"
    && test.left.type === "Identifier"
    && test.left.name === name
  )
}

function isStringConversion(reference: ESTree.Node): boolean {
  const call = reference.parent

  return (
    call?.type === "CallExpression"
    && call.callee.type === "Identifier"
    && call.callee.name === "String"
    && call.arguments.length === 1
    && call.arguments[0] === reference
  )
}

/**
 * Return whether a reference sits in a branch of `value instanceof Type ? narrowed : fallback`. The
 * first branch sees the narrowed type. The second branch may only convert the value with `String`.
 */
function isInstanceofBranch(reference: ReferenceIdentifier): boolean {
  let child: ESTree.Node = reference
  let current: ESTree.Node | null = reference.parent

  while (current !== null && !isRuntimeFunction(current)) {
    if (
      current.type === "ConditionalExpression"
      && isInstanceofSubject(current.test, reference.name)
    ) {
      return (
        current.consequent === child
        || (current.alternate === child && isStringConversion(reference))
      )
    }

    child = current
    current = current.parent
  }

  return false
}

/**
 * Return whether a reference passes the parameter to a parser or checks it with `instanceof`.
 */
function isParsedReference(reference: Reference, sourceCode: SourceCode): boolean {
  const identifier = reference.identifier

  if (!reference.isReadOnly()) return false
  const parent = identifier.parent

  return (
    (parent.type === "CallExpression"
      && parent.callee !== identifier
      && isParserCall(parent, sourceCode))
    || isInstanceofSubject(parent, identifier.name)
    || isInstanceofBranch(identifier)
  )
}

/**
 * Return whether a function is itself the parser for a parameter: every use of the parameter passes
 * it to a parser call or checks it with `instanceof`. A destructured parameter is never a parser
 * input, because destructuring reads the unknown value first.
 */
function isParserInput(
  owner: ParameterOwner,
  parameter: FunctionParameter,
  sourceCode: SourceCode
): boolean {
  if (!isRuntimeFunction(owner)) return false
  const binding = parameterIdentifier(parameter)

  if (binding === null) return false

  const variable = sourceCode
    .getDeclaredVariables(owner)
    .find((candidate) => candidate.identifiers.includes(binding))

  const references = variable?.references.filter((reference) => !reference.init) ?? []

  return (
    references.length > 0
    && references.every((reference) => isParsedReference(reference, sourceCode))
  )
}

/**
 * Disallow unknown inputs except explicitly named error-cause enrichment.
 */
const rule: Rule = {
  createOnce(context) {
    const checkParameters = (node: ParameterOwner) => {
      for (const [index, parameter] of node.params.entries()) {
        const annotation = functionParameterTypeAnnotation(parameter)

        if (annotation === null || annotation === undefined) continue

        if (!containsUnknownType(annotation.typeAnnotation)) continue
        const name = functionParameterBindingName(parameter, context.sourceCode)

        if (name === "cause" || isTypePredicateSubject(node, name)) continue

        if (index === 0 && isRejectionCallback(node)) continue

        if (isParserInput(node, parameter, context.sourceCode)) continue
        context.report({
          data: { parameter: name },
          messageId: "unknownParameter",
          node: annotation.typeAnnotation,
        })
      }
    }

    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      TSCallSignatureDeclaration: checkParameters,
      TSConstructSignatureDeclaration: checkParameters,
      TSConstructorType: checkParameters,
      TSDeclareFunction: checkParameters,
      TSEmptyBodyFunctionExpression: checkParameters,
      TSFunctionType: checkParameters,
      TSMethodSignature: checkParameters,
    }
  },
  meta: {
    docs: {
      description:
        "Disallow explicitly unknown function parameters except `cause`, type-predicate subjects, promise rejection reasons, and parameters that the function only passes to a schema parser. Decode unknown input at its I/O boundary instead.",
    },
    messages: {
      unknownParameter:
        "Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type and parse the input at the I/O boundary before calling this function. A parser function may take `unknown` if it only passes the parameter to a schema parser, such as `schema.parse()`.",
    },
    type: "problem",
  },
}

export default rule
