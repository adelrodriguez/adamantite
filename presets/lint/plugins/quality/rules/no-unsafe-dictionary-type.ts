import type { ESTree, Rule } from "@oxlint/plugins"

import {
  classifyUnsafeDictionary,
  classifyUnsafeDictionaryValue,
  classifyUnsafeHeritage,
  type TypeEnvironment,
} from "../shared/dictionary-types.ts"
import {
  hasVisibleTypeBinding,
  namedTypeReference,
  visibleInterfaces,
  visibleTypeAlias,
  withTypeBindings,
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

/**
 * Return whether a node is the whole body of a type alias, as `Bag` in `type Other = Bag`. Such an
 * alias gives the dictionary another name, so it reports as a declaration.
 */
function isTypeAliasBody(node: ESTree.TSType): boolean {
  return node.parent.type === "TSTypeAliasDeclaration" && node.parent.typeAnnotation === node
}

/**
 * Return whether a node is a plain use of a local alias or interface, as `Bag` in `const a: Bag` or
 * `type Logger = { info: (fields: Bag) => void }`. The declaration reports its own unsafe
 * dictionary, so its plain uses do not report again.
 */
function isPlainNamedConsumerUse(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (node.type !== "TSTypeReference" || node.typeArguments?.params.length) return false
  const reference = namedTypeReference(node)

  return (
    reference !== null
    && !reference.global
    && (visibleTypeAlias(reference.name, node, environment.typeAliases) !== null
      || visibleInterfaces(reference.name, node, environment.typeAliases).length > 0)
    && !isTypeAliasBody(node)
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

/**
 * Return whether to report an unsafe dictionary type, which the caller has classified.
 */
function shouldReportType(node: ESTree.TSType, environment: TypeEnvironment): boolean {
  if (isInsideTypeTest(node, environment)) return false

  if (isPlainNamedConsumerUse(node, environment)) return false
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
    const report = (node: ESTree.Node, value: string) => {
      context.report({ data: { value }, messageId: "unsafeDictionary", node })
    }

    const reportIfUnsafe = (node: ESTree.TSType, environment: TypeEnvironment) => {
      const unsafe = classifyUnsafeDictionary(node, environment)

      if (unsafe === null || !shouldReportType(node, environment)) return
      report(node, unsafe.unsafeValue)
    }

    const reportUnsafeHeritage = (node: Heritage, environment: TypeEnvironment) => {
      const unsafe = classifyUnsafeHeritage(node, environment)

      if (unsafe !== null) report(node, unsafe.unsafeValue)
    }

    return withTypeBindings(context, (defer) => {
      const checkType = (node: ESTree.TSType) => {
        defer((typeAliases) => {
          reportIfUnsafe(node, { typeAliases })
        })
      }

      const checkHeritage = (node: Heritage) => {
        defer((typeAliases) => {
          reportUnsafeHeritage(node, { typeAliases })
        })
      }

      return {
        TSClassImplements: checkHeritage,
        TSIndexSignature(node) {
          if (node.parent.type === "TSTypeLiteral") return
          defer((typeAliases) => {
            const unsafe = classifyUnsafeDictionaryValue(node.typeAnnotation.typeAnnotation, {
              typeAliases,
            })

            if (unsafe !== null) report(node, unsafe.unsafeValue)
          })
        },
        TSInterfaceHeritage: checkHeritage,
        TSMappedType: checkType,
        TSTypeLiteral: checkType,
        TSTypeReference: checkType,
      }
    })
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
