import type { Definition, ESTree, Rule, SourceCode } from "@oxlint/plugins"
import type { VisitorKeys } from "../shared/child-nodes.ts"
import { readBooleanOption } from "../../options.ts"
import { mentionsUncheckedType } from "../shared/function-parameters.ts"
import { resolveVariable } from "../shared/scope.ts"

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
 * Return the identifier at the root of a `typeof` operand, as `options` in `options.headers`.
 */
function operandRoot(argument: ESTree.Expression): ESTree.IdentifierReference | null {
  let current = argument

  while (
    current.type === "ParenthesizedExpression"
    || current.type === "ChainExpression"
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
 * annotation of its pattern, or of the binding that the pattern reads, one step away.
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

  if (declarator.type !== "VariableDeclarator" || declarator.init?.type !== "Identifier") {
    return null
  }

  const source = bindingName(declarator.init, sourceCode)

  return source === null ? null : ownAnnotation(source)
}

/**
 * Return whether a `typeof` operand reads a binding with a declared type that has no `unknown` or
 * `any`. Such a value is already parsed, so `typeof` only picks a member of an owned union.
 */
function hasOwnedType(
  argument: ESTree.Expression,
  sourceCode: SourceCode,
  visitorKeys: VisitorKeys
): boolean {
  const root = operandRoot(argument)
  const type = root === null ? null : declaredType(root, sourceCode)

  return type !== null && !mentionsUncheckedType(type, visitorKeys)
}

/**
 * Disallow runtime typeof checks that narrow unparsed values instead of decoding them.
 */
const rule: Rule = {
  createOnce(context) {
    return {
      UnaryExpression(node) {
        const allowInTypeGuards = readBooleanOption(context.options, "allowInTypeGuards") === true

        if (
          node.operator === "typeof"
          && !isExistenceProbe(node)
          && !hasOwnedType(node.argument, context.sourceCode, context.sourceCode.visitorKeys)
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
        "Disallow runtime typeof checks on values that may be unparsed. Decode external values into meaningful types at their I/O boundary. A value with a declared type that has no `unknown` or `any` may use typeof.",
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
