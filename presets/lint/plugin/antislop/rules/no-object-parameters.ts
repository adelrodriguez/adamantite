import type { ESTree, Rule } from "@oxlint/plugins"

import {
  functionParameterBindingName,
  functionParameterTypeAnnotation,
} from "../shared/function-parameters.ts"
import {
  createTypeAliasEnvironment,
  hasVisibleTypeBinding,
  namedTypeReference,
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

// These built-ins return `object` for `object`, so they keep it as broad as before.
const OBJECT_PRESERVING_WRAPPERS: ReadonlySet<string> = new Set(["NonNullable", "Readonly"])

/**
 * Return the type that a built-in `Readonly` or `NonNullable` wraps, unless a local declaration
 * shadows the name.
 */
function preservedObjectType(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment
): ESTree.TSType | null {
  if (type.type !== "TSTypeReference") return null
  const reference = namedTypeReference(type)

  if (reference === null || !OBJECT_PRESERVING_WRAPPERS.has(reference.name)) return null

  if (!reference.global && hasVisibleTypeBinding(reference.name, type, environment)) return null

  return reference.typeArguments[0] ?? null
}

function isEmptyObjectType(type: ESTree.TSType, environment: TypeAliasEnvironment): boolean {
  return resolvedTypeMatches(
    type,
    environment,
    (resolved, matches) =>
      (resolved.type === "TSTypeLiteral" && resolved.members.length === 0)
      || (resolved.type === "TSParenthesizedType" && matches(resolved.typeAnnotation))
  )
}

function resolvesToObject(type: ESTree.TSType, environment: TypeAliasEnvironment): boolean {
  return resolvedTypeMatches(type, environment, (resolved, matches) => {
    if (resolved.type === "TSObjectKeyword") return true

    if (resolved.type === "TSParenthesizedType") return matches(resolved.typeAnnotation)

    if (resolved.type === "TSUnionType") return resolved.types.some(matches)

    // `object & {}` is still `object`, but `object & Owner` names a contract.
    if (resolved.type === "TSIntersectionType") {
      return (
        resolved.types.some(matches)
        && resolved.types.every(
          (member) => matches(member) || isEmptyObjectType(member, environment)
        )
      )
    }

    const wrapped = preservedObjectType(resolved, environment)

    return wrapped !== null && matches(wrapped)
  })
}

/**
 * Ban the broad object type on function inputs, including local aliases to object.
 */
const rule: Rule = {
  createOnce(context) {
    let environment: TypeAliasEnvironment | null = null

    const checkParameters = (node: ParameterOwner) => {
      for (const parameter of node.params) {
        const annotation = functionParameterTypeAnnotation(parameter)

        if (annotation === null || annotation === undefined || environment === null) continue

        if (!resolvesToObject(annotation.typeAnnotation, environment)) continue
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
