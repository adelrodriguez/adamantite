import type { ESTree, Rule } from "@oxlint/plugins"

import {
  createTypeAliasEnvironment,
  type TypeAliasEnvironment,
} from "../shared/type-alias-resolution.ts"
import { exposesUnknown } from "../shared/unknown-type.ts"

type FunctionWithReturnType =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature

/**
 * Ban function contracts that return unknown instead of a parsed domain type.
 */
const rule: Rule = {
  createOnce(context) {
    let environment: TypeAliasEnvironment | null = null

    const checkReturnType = (node: FunctionWithReturnType) => {
      const annotation = node.returnType

      if (annotation === null || annotation === undefined || environment === null) return

      if (!exposesUnknown(annotation.typeAnnotation, environment)) return
      context.report({ messageId: "unknownReturn", node: annotation.typeAnnotation })
    }

    return {
      ArrowFunctionExpression: checkReturnType,
      FunctionDeclaration: checkReturnType,
      FunctionExpression: checkReturnType,
      Program(node) {
        environment = createTypeAliasEnvironment(node, context.sourceCode.visitorKeys)
      },
      TSCallSignatureDeclaration: checkReturnType,
      TSConstructSignatureDeclaration: checkReturnType,
      TSConstructorType: checkReturnType,
      TSDeclareFunction: checkReturnType,
      TSEmptyBodyFunctionExpression: checkReturnType,
      TSFunctionType: checkReturnType,
      TSMethodSignature: checkReturnType,
    }
  },
  meta: {
    docs: {
      description:
        "Disallow functions whose explicit return contract is unknown, or a promise, iterable, or generator of unknown, such as Promise<unknown>.",
    },
    messages: {
      unknownReturn:
        "This function exposes `unknown` to its caller. Parse the value at its boundary and return a named domain type.",
    },
    type: "problem",
  },
}

export default rule
