import type { Definition, ESTree, Rule, SourceCode } from "@oxlint/plugins"
import { readBooleanOption } from "../../options.ts"
import { resolveVariable } from "../shared/scope.ts"
import {
  createTypeAliasEnvironment,
  resolvedTypeMatches,
  type TypeAliasEnvironment,
} from "../shared/type-alias-resolution.ts"
import { mentionsUncheckedType } from "../shared/unknown-type.ts"

type RuntimeFunction = ESTree.ArrowFunctionExpression | ESTree.Function

function isRuntimeFunction(node: ESTree.Node): node is RuntimeFunction {
  return (
    node.type === "ArrowFunctionExpression"
    || node.type === "FunctionDeclaration"
    || node.type === "FunctionExpression"
  )
}

/**
 * Return a function's declared return type. It comes from the function's own annotation, or from
 * the function type that annotates the variable it initializes.
 */
function declaredReturnType(fn: RuntimeFunction): ESTree.TSType | undefined {
  if (fn.returnType) return fn.returnType.typeAnnotation
  const declarator = fn.parent

  if (declarator.type !== "VariableDeclarator" || declarator.init !== fn) return undefined
  const annotation = declarator.id.typeAnnotation?.typeAnnotation

  return annotation?.type === "TSFunctionType" ? annotation.returnType.typeAnnotation : undefined
}

/**
 * Return whether a function is passed inline to a call, as in `values.every((item) => ...)`.
 */
function isInlineCallback(fn: RuntimeFunction): boolean {
  const call = fn.parent

  return call.type === "CallExpression" && call.arguments.some((argument) => argument === fn)
}

/**
 * Return whether a node runs inside a type guard. An inline callback without its own return type
 * belongs to the function that passes it, so the search continues to that function.
 */
function isInsideTypeGuard(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent

  while (current !== null && current.type !== "Program") {
    if (isRuntimeFunction(current)) {
      const returnType = declaredReturnType(current)

      if (returnType !== undefined) return returnType.type === "TSTypePredicate"

      if (!isInlineCallback(current)) return false
    }

    current = current.parent
  }

  return false
}

/**
 * Return whether typeof safely probes for the existence of a possibly absent binding.
 */
function isExistenceProbe(node: ESTree.UnaryExpression): boolean {
  const parent = node.parent

  if (parent.type !== "BinaryExpression") return false

  if (!["===", "!==", "==", "!="].includes(parent.operator)) return false
  const other = parent.left === node ? parent.right : parent.left

  return other.type === "Literal" && other.value === "undefined"
}

type BindingName = Definition["name"]

/**
 * Return the identifier at the root of a `typeof` operand, as `options` in `options.headers` or
 * `options!.headers`. A non-null assertion keeps the owned type of the root. An `as` or `satisfies`
 * expression can change the type, so the search stops there.
 */
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

/**
 * Return the annotation written on a binding. A parameter with a default value keeps its annotation
 * on the binding.
 */
function ownAnnotation(name: BindingName): ESTree.TSType | null {
  return name.typeAnnotation?.typeAnnotation ?? null
}

/**
 * Return the object pattern that destructures a binding, as in `const { headers } = options`.
 */
function destructuringPattern(
  name: BindingName
): ESTree.ObjectAssignmentTarget | ESTree.ObjectPattern | null {
  const value =
    name.parent.type === "AssignmentPattern" && name.parent.left === name ? name.parent : name

  const property = value.parent

  if (property.type !== "Property" || property.value !== value) return null

  return property.parent.type === "ObjectPattern" ? property.parent : null
}

/**
 * Return the annotation that declares a binding. A binding destructured from an object takes the
 * annotation of its pattern, or of the binding at the root of the value that the pattern reads, one
 * step away, as `options` in `const { headers } = options!` or `options.transport`.
 */
function declaredType(
  identifier: ESTree.IdentifierReference,
  sourceCode: SourceCode
): ESTree.TSType | null {
  const name = bindingName(identifier, sourceCode)

  if (name === null) return null

  const pattern = destructuringPattern(name)

  if (pattern === null) return ownAnnotation(name)

  if (pattern.typeAnnotation) return pattern.typeAnnotation.typeAnnotation
  const declarator = pattern.parent

  if (declarator.type !== "VariableDeclarator" || declarator.init === null) return null
  const root = operandRoot(declarator.init)
  const source = root === null ? null : bindingName(root, sourceCode)

  return source === null ? null : ownAnnotation(source)
}

/**
 * Return the type parameter that a type reference names, as `T` in `<T>(value: T)`, or null when
 * the reference names another type.
 */
function referencedTypeParameter(type: ESTree.TSTypeReference): ESTree.TSTypeParameter | null {
  if (type.typeName.type !== "Identifier" || type.typeArguments) return null
  const name = type.typeName.name
  let current: ESTree.Node | null = type.parent

  while (current !== null) {
    if ("typeParameters" in current) {
      const parameter = current.typeParameters?.params.find(
        (candidate) => candidate.name.name === name
      )

      if (parameter !== undefined) return parameter
    }

    current = current.parent
  }

  return null
}

/**
 * Return whether a declared type may hold any value, because it is a type parameter with no
 * constraint, or with a constraint that has `unknown` or `any`, as in `<T>(value: T)`. A union
 * matches when one of its members matches. The check resolves local aliases, as in `type Same<X> =
 * X` with `value: Same<T>`.
 */
function isUncheckedTypeParameter(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment,
  seen: ReadonlySet<ESTree.TSTypeParameter>
): boolean {
  return resolvedTypeMatches(type, environment, (resolved, matches) => {
    if (resolved.type === "TSParenthesizedType") return matches(resolved.typeAnnotation)

    if (resolved.type === "TSUnionType") return resolved.types.some(matches)

    if (resolved.type !== "TSTypeReference") return false
    const parameter = referencedTypeParameter(resolved)

    if (parameter === null || seen.has(parameter)) return false
    const constraint = parameter.constraint

    return (
      constraint === null
      || mentionsUncheckedType(constraint, environment)
      || isUncheckedTypeParameter(constraint, environment, new Set([...seen, parameter]))
    )
  })
}

/**
 * Return whether a `typeof` operand reads a binding with a declared type that has no `unknown` or
 * `any`, and that is not a type parameter that may hold any value. Such a value is already parsed,
 * so `typeof` only picks a member of an owned union. Local aliases resolve to their bodies. An
 * imported alias has no body in the file, so it counts as owned.
 */
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

/**
 * Disallow runtime typeof checks that narrow unparsed values instead of decoding them.
 */
const rule: Rule = {
  createOnce(context) {
    let environment: TypeAliasEnvironment | null = null

    return {
      Program(node) {
        environment = createTypeAliasEnvironment(node, context.sourceCode.visitorKeys)
      },
      UnaryExpression(node) {
        const allowInTypeGuards = readBooleanOption(context.options, "allowInTypeGuards") === true

        if (
          environment !== null
          && node.operator === "typeof"
          && !isExistenceProbe(node)
          && !hasOwnedType(node.argument, context.sourceCode, environment)
          && (!allowInTypeGuards || !isInsideTypeGuard(node))
        ) {
          context.report({ messageId: "runtimeTypeof", node })
        }
      },
    }
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
