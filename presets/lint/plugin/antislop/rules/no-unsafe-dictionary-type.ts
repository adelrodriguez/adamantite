import type { ESTree, Rule } from "@oxlint/plugins"

import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
  classifyUnsafeHeritage,
  createTypeEnvironment,
  type TypeEnvironment,
} from "../shared/dictionary-types.ts"
import {
  hasVisibleTypeBinding,
  namedTypeReference,
  visibleTypeAlias,
} from "../shared/type-alias-resolution.ts"

const typeNodeKinds: ReadonlySet<string> = new Set([
  "JSDocNonNullableType",
  "JSDocNullableType",
  "JSDocUnknownType",
  "TSAnyKeyword",
  "TSArrayType",
  "TSBigIntKeyword",
  "TSBooleanKeyword",
  "TSConditionalType",
  "TSConstructorType",
  "TSFunctionType",
  "TSImportType",
  "TSIndexedAccessType",
  "TSInferType",
  "TSIntersectionType",
  "TSIntrinsicKeyword",
  "TSLiteralType",
  "TSMappedType",
  "TSNamedTupleMember",
  "TSNeverKeyword",
  "TSNullKeyword",
  "TSNumberKeyword",
  "TSObjectKeyword",
  "TSParenthesizedType",
  "TSStringKeyword",
  "TSSymbolKeyword",
  "TSTemplateLiteralType",
  "TSThisType",
  "TSTupleType",
  "TSTypeLiteral",
  "TSTypeOperator",
  "TSTypePredicate",
  "TSTypeQuery",
  "TSTypeReference",
  "TSUndefinedKeyword",
  "TSUnionType",
  "TSUnknownKeyword",
  "TSVoidKeyword",
])

function isTypeNode(node: ESTree.Node): node is ESTree.TSType {
  return typeNodeKinds.has(node.type)
}

type Heritage = ESTree.TSClassImplements | ESTree.TSInterfaceHeritage

function isHeritage(node: ESTree.Node): node is Heritage {
  return node.type === "TSClassImplements" || node.type === "TSInterfaceHeritage"
}

function isInsideTypeAliasDeclaration(node: ESTree.Node): boolean {
  let current: ESTree.Node | null = node.parent

  while (current !== null && current.type !== "Program") {
    if (current.type === "TSTypeAliasDeclaration") return true
    current = current.parent
  }

  return false
}

function isPlainAliasConsumerUse(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (node.type !== "TSTypeReference" || node.typeArguments?.params.length) return false
  const reference = namedTypeReference(node)

  return (
    reference !== null
    && !reference.global
    && visibleTypeAlias(reference.name, node, environment.typeAliases) !== null
    && !isInsideTypeAliasDeclaration(node)
  )
}

// The second type argument of these built-ins filters a union, like a conditional type test.
const typeFilters: ReadonlySet<string> = new Set(["Exclude", "Extract"])

function isTypeFilterArgument(
  child: ESTree.Node,
  parent: ESTree.Node,
  environment: TypeEnvironment
): boolean {
  if (parent.type !== "TSTypeParameterInstantiation" || parent.params[1] !== child) return false
  const reference = parent.parent

  if (reference.type !== "TSTypeReference") return false
  const filter = namedTypeReference(reference)

  return (
    filter !== null
    && typeFilters.has(filter.name)
    && (filter.global || !hasVisibleTypeBinding(filter.name, reference, environment.typeAliases))
  )
}

// A constraint, a conditional type test, and a filter compare a type with a dictionary. `object`
// also matches interfaces and arrays, so it does not replace the dictionary there.
function isTypeTest(child: ESTree.Node, parent: ESTree.Node, environment: TypeEnvironment) {
  return (
    (parent.type === "TSTypeParameter" && parent.constraint === child)
    || (parent.type === "TSConditionalType" && parent.extendsType === child)
    || isTypeFilterArgument(child, parent, environment)
  )
}

function isInsideTypeTest(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  let child: ESTree.Node = node
  let parent: ESTree.Node = child.parent

  while (parent.type !== "Program") {
    if (isTypeTest(child, parent, environment)) return true
    child = parent
    parent = child.parent
  }

  return false
}

function shouldReportType(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (isInsideTypeTest(node, environment)) return false

  if (isPlainAliasConsumerUse(node, environment)) return false

  if (classifyUnsafeDictionary(node, environment) === null) return false
  let current: ESTree.Node = node.parent

  while (current.type !== "Program") {
    if (isTypeNode(current) && classifyUnsafeDictionary(current, environment) !== null) return false

    if (isHeritage(current) && classifyUnsafeHeritage(current, environment) !== null) return false
    current = current.parent
  }

  return true
}

/**
 * Disallow object-dictionary contracts whose direct value type is an unsafe escape hatch.
 */
const rule: Rule = {
  createOnce(context) {
    let environment: TypeEnvironment | null = null

    const report = (node: ESTree.Node, value: string) => {
      context.report({ data: { value }, messageId: "unsafeDictionary", node })
    }

    const reportIfUnsafe = (node: ESTree.TSType) => {
      if (environment === null || !shouldReportType(node, environment)) return
      const unsafe = classifyUnsafeDictionary(node, environment)

      if (unsafe === null) return
      report(node, unsafe.unsafeValue)
    }

    const reportUnsafeHeritage = (node: Heritage) => {
      if (environment === null) return
      const unsafe = classifyUnsafeHeritage(node, environment)

      if (unsafe !== null) report(node, unsafe.unsafeValue)
    }

    return {
      Program(node) {
        environment = createTypeEnvironment(node, context.sourceCode.visitorKeys)
      },
      TSClassImplements: reportUnsafeHeritage,
      TSIndexSignature(node) {
        if (environment === null || node.parent.type === "TSTypeLiteral") return

        const unsafe = classifyUnsafeDictionaryValue(
          node.typeAnnotation.typeAnnotation,
          environment
        )

        if (unsafe !== null) report(node, unsafe.unsafeValue)
      },
      TSInterfaceHeritage: reportUnsafeHeritage,
      TSMappedType: reportIfUnsafe,
      TSTypeLiteral: reportIfUnsafe,
      TSTypeReference: reportIfUnsafe,
    }
  },
  meta: {
    docs: {
      description:
        "Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches.",
    },
    messages: {
      unsafeDictionary:
        "This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.",
    },
    type: "problem",
  },
}

export default rule
