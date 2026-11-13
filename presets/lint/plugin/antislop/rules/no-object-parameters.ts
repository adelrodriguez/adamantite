import type { ESTree, Rule } from "@oxlint/plugins"

import {
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from "../shared/function-parameters.ts"
import {
  createTypeAliasEnvironment,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "../shared/type-alias-resolution.ts"

type ParameterOwner =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature

/**
 * Ban the broad object type on function inputs, including local aliases to object.
 */
const rule: Rule = {
  createOnce(context) {
    let environment: TypeAliasEnvironment | null = null

    const resolvesToObject = (type: ESTree.TSType): boolean =>
      environment !== null
      && resolvedTypeMatches(type, environment, (resolved, matches) => {
        if (resolved.type === "TSObjectKeyword") return true

        if (resolved.type === "TSParenthesizedType") {
          return matches(resolved.typeAnnotation)
        }

        return resolved.type === "TSUnionType" && resolved.types.some(matches)
      })

    const checkParameters = (node: ParameterOwner) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter)

        if (annotation === null || annotation === undefined) continue

        if (!resolvesToObject(annotation.typeAnnotation)) continue
        context.report({
          data: { parameter: functionParameterBindingName(parameter, context.sourceCode) },
          messageId: "objectParameter",
          node: annotation.typeAnnotation,
        })
      }
    }

    return {
      ArrowFunctionExpression: checkParameters,
      FunctionDeclaration: checkParameters,
      FunctionExpression: checkParameters,
      Program(node) {
        environment = createTypeAliasEnvironment(node, context.sourceCode.visitorKeys)
      },
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
        "Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.",
    },
    messages: {
      objectParameter:
        "Parameter `{{parameter}}` uses the broad `object` type. Use a named domain type, `WeakKey` for a WeakMap or WeakSet key, or a generic `<T extends object>` that keeps the caller's type.",
    },
    type: "problem",
  },
}

export default rule
