import type { Definition, ESTree, Rule, SourceCode } from "@oxlint/plugins"
import { readBooleanOption } from "../../shared/options.ts"
import { resolveVariable } from "../../shared/scope.ts"
import {
  resolvedTypeMatches,
  visibleTypeParameter,
  type TypeAliasEnvironment,
  withTypeBindings,
} from "../shared/type-alias-resolution.ts"
import { builtInTypeName, mentionsUncheckedType } from "../shared/unknown-type.ts"

type RuntimeFunction = ESTree.ArrowFunctionExpression | ESTree.Function

function isRuntimeFunction(node: ESTree.Node): node is RuntimeFunction {
  return (
    node.type === "ArrowFunctionExpression"
    || node.type === "FunctionDeclaration"
    || node.type === "FunctionExpression"
  )
}

function declaredReturnType(fn: RuntimeFunction): ESTree.TSType | undefined {
  if (fn.returnType) {
    return fn.returnType.typeAnnotation
  }

  const declarator = fn.parent

  if (declarator.type !== "VariableDeclarator" || declarator.init !== fn) {
    return undefined
  }

  const annotation = declarator.id.typeAnnotation?.typeAnnotation

  return annotation?.type === "TSFunctionType" ? annotation.returnType.typeAnnotation : undefined
}

function isInlineCallback(fn: RuntimeFunction): boolean {
  const call = fn.parent

  return call.type === "CallExpression" && call.arguments.some((argument) => argument === fn)
}

function isInsideTypeGuard(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent

  while (current !== null && current.type !== "Program") {
    if (isRuntimeFunction(current)) {
      const returnType = declaredReturnType(current)

      if (returnType !== undefined) {
        return returnType.type === "TSTypePredicate"
      }

      if (!isInlineCallback(current)) {
        return false
      }
    }

    current = current.parent
  }

  return false
}

function isExistenceProbe(node: ESTree.UnaryExpression): boolean {
  const parent = node.parent

  if (parent.type !== "BinaryExpression") {
    return false
  }

  if (!["===", "!==", "==", "!="].includes(parent.operator)) {
    return false
  }

  const other = parent.left === node ? parent.right : parent.left

  return other.type === "Literal" && other.value === "undefined"
}

type BindingName = Definition["name"]

// A non-null assertion only removes `null` and `undefined` from the type of its operand, so an
// owned type stays owned. An `as` expression can replace the type, and `satisfies` gives its
// operand a contextual type, so the walk stops at both.
function operandRoot(argument: ESTree.Expression): ESTree.IdentifierReference | null {
  let current = argument

  while (
    current.type === "ParenthesizedExpression"
    || current.type === "ChainExpression"
    || current.type === "TSNonNullExpression"
    || current.type === "MemberExpression"
  ) {
    current = current.type === "MemberExpression" ? current.object : current.expression
  }

  return current.type === "Identifier" ? current : null
}

function bindingName(
  identifier: ESTree.IdentifierReference,
  sourceCode: SourceCode
): BindingName | null {
  return resolveVariable(sourceCode, identifier)?.defs[0]?.name ?? null
}

// A parameter with a default value keeps its annotation on the binding.
function ownAnnotation(name: BindingName): ESTree.TSType | null {
  return name.typeAnnotation?.typeAnnotation ?? null
}

function destructuringPattern(
  name: BindingName
): ESTree.ObjectAssignmentTarget | ESTree.ObjectPattern | null {
  const value =
    name.parent.type === "AssignmentPattern" && name.parent.left === name ? name.parent : name

  const property = value.parent

  if (property.type !== "Property" || property.value !== value) {
    return null
  }

  return property.parent.type === "ObjectPattern" ? property.parent : null
}

function declaredType(
  identifier: ESTree.IdentifierReference,
  sourceCode: SourceCode
): ESTree.TSType | null {
  const name = bindingName(identifier, sourceCode)

  if (name === null) {
    return null
  }

  const pattern = destructuringPattern(name)

  if (pattern === null) {
    return ownAnnotation(name)
  }

  if (pattern.typeAnnotation) {
    return pattern.typeAnnotation.typeAnnotation
  }

  const declarator = pattern.parent

  if (declarator.type !== "VariableDeclarator" || declarator.init === null) {
    return null
  }

  const root = operandRoot(declarator.init)
  const source = root === null ? null : bindingName(root, sourceCode)

  return source === null ? null : ownAnnotation(source)
}

function referencedTypeParameter(
  type: ESTree.TSTypeReference,
  environment: TypeAliasEnvironment
): ESTree.TSTypeParameter | null {
  return type.typeName.type !== "Identifier" || type.typeArguments
    ? null
    : visibleTypeParameter(type.typeName.name, type, environment)
}

// These built-ins hold every value of their type argument, apart from `null` and `undefined`,
// so `NonNullable<T>` holds any value of an unconstrained `T`.
const PASS_THROUGH_TYPES: ReadonlySet<string> = new Set(["Awaited", "NoInfer", "NonNullable"])

function addsNothing(type: ESTree.TSType, environment: TypeAliasEnvironment): boolean {
  return resolvedTypeMatches(type, environment, (resolved, matches) => {
    if (resolved.type === "TSParenthesizedType") {
      return matches(resolved.typeAnnotation)
    }

    return (
      resolved.type === "TSObjectKeyword"
      || resolved.type === "TSUnknownKeyword"
      || (resolved.type === "TSTypeLiteral" && resolved.members.length === 0)
    )
  })
}

function isUncheckedTypeParameter(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment,
  seen: ReadonlySet<ESTree.TSTypeParameter>
): boolean {
  return resolvedTypeMatches(type, environment, (resolved, matches) => {
    if (resolved.type === "TSParenthesizedType") {
      return matches(resolved.typeAnnotation)
    }

    if (resolved.type === "TSUnionType") {
      return resolved.types.some(matches)
    }

    if (resolved.type === "TSIntersectionType") {
      return (
        resolved.types.some(matches)
        && resolved.types.every((member) => addsNothing(member, environment) || matches(member))
      )
    }

    if (resolved.type !== "TSTypeReference") {
      return false
    }

    const wrapper = builtInTypeName(resolved, environment)
    const argument = resolved.typeArguments?.params[0]

    if (wrapper !== null && PASS_THROUGH_TYPES.has(wrapper) && argument !== undefined) {
      return matches(argument)
    }

    const parameter = referencedTypeParameter(resolved, environment)

    if (parameter === null || seen.has(parameter)) {
      return false
    }

    const constraint = parameter.constraint

    return (
      constraint === null
      || mentionsUncheckedType(constraint, environment)
      || isUncheckedTypeParameter(constraint, environment, new Set([...seen, parameter]))
    )
  })
}

function hasOwnedType(
  argument: ESTree.Expression,
  sourceCode: SourceCode,
  environment: TypeAliasEnvironment
): boolean {
  const root = operandRoot(argument)
  const type = root === null ? null : declaredType(root, sourceCode)

  return (
    type !== null
    && !mentionsUncheckedType(type, environment)
    && !isUncheckedTypeParameter(type, environment, new Set())
  )
}

const rule: Rule = {
  createOnce(context) {
    return withTypeBindings(context, (defer) => ({
      UnaryExpression(node) {
        if (node.operator !== "typeof" || isExistenceProbe(node)) {
          return
        }

        const allowInTypeGuards = readBooleanOption(context.options, "allowInTypeGuards") === true

        if (allowInTypeGuards && isInsideTypeGuard(node)) {
          return
        }

        defer((environment) => {
          if (hasOwnedType(node.argument, context.sourceCode, environment)) {
            return
          }

          context.report({ messageId: "runtimeTypeof", node })
        })
      },
    }))
  },
  meta: {
    defaultOptions: [{ allowInTypeGuards: false }],
    docs: {
      description:
        "Disallow runtime typeof checks on values that may be unparsed. Decode external values into meaningful types at their I/O boundary. A value with a declared type that has no `unknown` or `any`, and that is not an unconstrained type parameter, may use typeof. The rule resolves local type aliases before it checks the type.",
    },
    messages: {
      runtimeTypeof:
        "A `typeof` check narrows a representation without establishing its contract. Parse input at its I/O boundary, then branch on the domain value. A value with a declared owned type, such as `retry: number | RetryPolicy`, may use `typeof`.",
    },
    schema: [
      {
        additionalProperties: false,
        properties: {
          allowInTypeGuards: { type: "boolean" },
        },
        type: "object",
      },
    ],
    type: "problem",
  },
}

export default rule
