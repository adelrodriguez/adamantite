import type { ESTree, Rule } from "@oxlint/plugins"

import { withTypeBindings } from "../shared/type-alias-resolution.ts"
import { exposesUnknown } from "../shared/unknown-type.ts"

type FunctionWithReturnType =
  | ESTree.ArrowFunctionExpression
  | ESTree.Function
  | ESTree.TSCallSignatureDeclaration
  | ESTree.TSConstructSignatureDeclaration
  | ESTree.TSConstructorType
  | ESTree.TSFunctionType
  | ESTree.TSMethodSignature

const rule: Rule = {
  createOnce(context) {
    return withTypeBindings(context, (defer) => {
      function checkReturnType(node: FunctionWithReturnType) {
        const annotation = node.returnType

        if (annotation === null || annotation === undefined) {
          return
        }

        defer((environment) => {
          if (!exposesUnknown(annotation.typeAnnotation, environment)) {
            return
          }

          context.report({ messageId: "unknownReturn", node: annotation.typeAnnotation })
        })
      }

      return {
        ArrowFunctionExpression: checkReturnType,
        FunctionDeclaration: checkReturnType,
        FunctionExpression: checkReturnType,
        TSCallSignatureDeclaration: checkReturnType,
        TSConstructSignatureDeclaration: checkReturnType,
        TSConstructorType: checkReturnType,
        TSDeclareFunction: checkReturnType,
        TSEmptyBodyFunctionExpression: checkReturnType,
        TSFunctionType: checkReturnType,
        TSMethodSignature: checkReturnType,
      }
    })
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
