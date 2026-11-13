import type { ESTree, Rule } from "@oxlint/plugins"

import {
  containsUnknownType,
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from "../shared/function-parameters.ts"
type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature

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
  if (call?.type !== "CallExpression") return false
  const callee = call.callee
  if (callee.type !== "MemberExpression" || callee.computed) return false
  if (callee.property.type !== "Identifier") return false
  const index = REJECTION_CALLBACK_INDEX.get(callee.property.name)
  return index !== undefined && call.arguments[index] === owner
}

/**
 * Disallow unknown inputs except explicitly named error-cause enrichment.
 */
const rule: Rule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow explicitly unknown function parameters except `cause`, type-predicate subjects, and promise rejection reasons; decode unknown input at its I/O boundary instead.",
    },
    messages: {
      unknownParameter:
        "Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.",
    },
  },
  createOnce(context) {
    const checkParameters = (node: ParameterOwner) => {
      for (const [index, parameter] of node.params.entries()) {
        const annotation = functionParameterTypeAnnotation(parameter)
        if (annotation === null || annotation === undefined) continue
        if (!containsUnknownType(annotation.typeAnnotation)) continue
        const name = functionParameterBindingName(parameter, context.sourceCode)
        if (name === "cause" || isTypePredicateSubject(node, name)) continue
        if (index === 0 && isRejectionCallback(node)) continue
        context.report({
          node: annotation.typeAnnotation,
          messageId: "unknownParameter",
          data: { parameter: name },
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
}

export default rule
