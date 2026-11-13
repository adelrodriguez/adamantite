import type { ESTree } from "@oxlint/plugins"

import { lexicalTypeParameterNames } from "./lexical-type-parameters.ts"
import {
  createTypeAliasEnvironment,
  hasVisibleTypeBinding,
  namedTypeReference,
  visibleTypeAlias,
  visibleInterfaces,
  type NamedTypeReference,
  type TypeAliasEnvironment as LexicalTypeAliasEnvironment,
} from "./type-alias-resolution.ts"

const BUILT_INS = new Set([
  "Record",
  "Readonly",
  "Partial",
  "Required",
  "Pick",
  "Omit",
  "PropertyKey",
  "NonNullable",
])

const TRANSPARENT_WRAPPERS = new Set(["Readonly", "Partial", "Required", "NonNullable"])

/**
 * The type argument bound to each type parameter, with the substitutions of the place that wrote
 * it.
 */
type TypeAliasEnvironment = ReadonlyMap<string, ResolvedType>

type ResolvedType = {
  readonly type: ESTree.TSType
  readonly substitutions: TypeAliasEnvironment
}

export type UnsafeDictionary = {
  readonly kind: "unsafe-dictionary"
  readonly unsafeValue: "any" | "empty-object" | "object" | "union" | "unknown"
}

export type WideningTargetKind =
  | "anonymous object"
  | "generic container"
  | "object"
  | "open dictionary"
  | "unknown"

export type WideningTarget = {
  readonly kind: WideningTargetKind
}

export type TypeEnvironment = {
  readonly typeAliases: LexicalTypeAliasEnvironment
}

export function createTypeEnvironment(
  program: ESTree.Program,
  visitorKeys: Readonly<Record<string, readonly string[]>>
): TypeEnvironment {
  return { typeAliases: createTypeAliasEnvironment(program, visitorKeys) }
}

function isBuiltIn(
  reference: NamedTypeReference,
  name: string,
  environment: TypeEnvironment
): boolean {
  return (
    reference.name === name
    && BUILT_INS.has(name)
    && (reference.global || !hasVisibleTypeBinding(name, reference.node, environment.typeAliases))
  )
}

function isTransparentWrapper(reference: NamedTypeReference, environment: TypeEnvironment) {
  return (
    TRANSPARENT_WRAPPERS.has(reference.name) && isBuiltIn(reference, reference.name, environment)
  )
}

/**
 * Return the type argument bound to a type parameter. A `globalThis` use names no type parameter.
 */
function substitutionFor(
  reference: NamedTypeReference,
  substitutions: TypeAliasEnvironment
): ResolvedType | undefined {
  return reference.global ? undefined : substitutions.get(reference.name)
}

function localAlias(
  reference: NamedTypeReference,
  environment: TypeEnvironment
): ESTree.TSTypeAliasDeclaration | null {
  return reference.global
    ? null
    : visibleTypeAlias(reference.name, reference.node, environment.typeAliases)
}

function localInterfaces(
  reference: NamedTypeReference,
  environment: TypeEnvironment
): readonly ESTree.TSInterfaceDeclaration[] {
  return reference.global
    ? []
    : visibleInterfaces(reference.name, reference.node, environment.typeAliases)
}

function hasTypeParameters(
  declaration: ESTree.TSInterfaceDeclaration | ESTree.TSTypeAliasDeclaration
): boolean {
  return (declaration.typeParameters?.params.length ?? 0) > 0
}

const BROAD_KEY_TYPES: ReadonlySet<string> = new Set([
  "TSNumberKeyword",
  "TSStringKeyword",
  "TSSymbolKeyword",
])

const FINITE_KEY_TYPES: ReadonlySet<string> = new Set(["TSLiteralType", "TSNeverKeyword"])

/**
 * How many keys a key type allows. `string`, `number`, `symbol`, and `PropertyKey` allow any key,
 * and literal types allow a finite set. An imported type or an unbound type parameter is
 * unresolved, because the rule cannot see its keys.
 */
type KeyBreadth = "broad" | "finite" | "unresolved"

function unionKeyBreadth(members: readonly KeyBreadth[]): KeyBreadth {
  if (members.includes("broad")) return "broad"

  return members.every((member) => member === "finite") ? "finite" : "unresolved"
}

function keyBreadth(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  visitedAliases: ReadonlySet<string> = new Set()
): KeyBreadth {
  const unwrapped = unwrapTransparentType(type)

  if (BROAD_KEY_TYPES.has(unwrapped.type)) return "broad"

  if (FINITE_KEY_TYPES.has(unwrapped.type)) return "finite"

  if (unwrapped.type === "TSUnionType") {
    return unionKeyBreadth(
      unwrapped.types.map((member) =>
        keyBreadth(member, environment, substitutions, visitedAliases)
      )
    )
  }

  if (unwrapped.type !== "TSTypeReference") return "unresolved"
  const reference = namedTypeReference(unwrapped)

  if (reference === null) return "unresolved"
  const { name } = reference
  const substitution = substitutionFor(reference, substitutions)

  if (substitution !== undefined) {
    return keyBreadth(substitution.type, environment, substitution.substitutions, visitedAliases)
  }

  if (isBuiltIn(reference, "PropertyKey", environment)) return "broad"
  const alias = localAlias(reference, environment)

  if (alias === null || hasTypeParameters(alias) || visitedAliases.has(name)) return "unresolved"
  const nextVisited = new Set(visitedAliases)
  nextVisited.add(name)

  return keyBreadth(alias.typeAnnotation, environment, new Map(), nextVisited)
}

/**
 * Return the breadth of a `Record` key. `Record` with no type arguments is still an error in
 * TypeScript, so treat it as open.
 */
function recordKeyBreadth(
  reference: NamedTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment
): KeyBreadth {
  const [key] = reference.typeArguments

  return key === undefined ? "broad" : keyBreadth(key, environment, substitutions)
}

function unwrapTransparentType(type: ESTree.TSType): ESTree.TSType {
  let current = type

  while (
    current.type === "TSParenthesizedType"
    || (current.type === "TSTypeOperator" && current.operator === "readonly")
  ) {
    current = current.typeAnnotation
  }

  return current
}

function isNeverType(type: ESTree.TSType): boolean {
  return unwrapTransparentType(type).type === "TSNeverKeyword"
}

function isEffectivelyEmptyMember(member: ESTree.TSSignature): boolean {
  return (
    member.type === "TSPropertySignature"
    && member.optional
    && member.typeAnnotation !== null
    && isNeverType(member.typeAnnotation.typeAnnotation)
  )
}

function isEffectivelyEmptyTypeLiteral(type: ESTree.TSTypeLiteral): boolean {
  return type.members.length === 0 || type.members.every(isEffectivelyEmptyMember)
}

function isEffectivelyEmptyInterface(
  declarations: readonly ESTree.TSInterfaceDeclaration[]
): boolean {
  if (declarations.length !== 1) return false
  const [type] = declarations

  return (
    type?.extends.length === 0
    && (type.body.body.length === 0 || type.body.body.every(isEffectivelyEmptyMember))
  )
}

/**
 * Bind an alias's type parameters for its body. The body sees only these parameters, because the
 * type parameters of the alias that refers to it are not in scope there. Each explicit argument
 * keeps the substitutions of the place that wrote it, and a default sees the parameters before it.
 */
function aliasSubstitution(
  alias: ESTree.TSTypeAliasDeclaration,
  arguments_: readonly ESTree.TSType[],
  base: TypeAliasEnvironment
): TypeAliasEnvironment | null {
  const parameters = alias.typeParameters?.params ?? []
  const next = new Map<string, ResolvedType>()

  for (const [index, parameter] of parameters.entries()) {
    const explicitArgument = arguments_[index]
    const argument = explicitArgument ?? parameter.default

    if (argument === null) return null
    next.set(parameter.name.name, {
      substitutions: explicitArgument === undefined ? new Map(next) : base,
      type: argument,
    })
  }

  return next
}

function unsafeDirectValue(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>
): UnsafeDictionary["unsafeValue"] | null {
  const unwrapped = unwrapTransparentType(type)

  if (unwrapped.type === "TSUnknownKeyword") return "unknown"

  if (unwrapped.type === "TSAnyKeyword") return "any"

  if (unwrapped.type === "TSObjectKeyword") return "object"

  if (unwrapped.type === "TSTypeLiteral" && isEffectivelyEmptyTypeLiteral(unwrapped))
    return "empty-object"

  if (unwrapped.type === "TSUnionType") {
    return unwrapped.types.some(
      (member) => unsafeDirectValue(member, environment, substitutions, resolvingAliases) !== null
    )
      ? "union"
      : null
  }

  if (unwrapped.type === "TSIntersectionType") {
    const unsafeMembers = unwrapped.types.map((member) =>
      unsafeDirectValue(member, environment, substitutions, resolvingAliases)
    )

    if (unsafeMembers.includes("any")) return "any"

    const [first = null] = unsafeMembers

    return unsafeMembers.every((member) => member !== null) ? first : null
  }

  if (unwrapped.type !== "TSTypeReference") return null
  const reference = namedTypeReference(unwrapped)

  if (reference === null) return null
  const { name, typeArguments } = reference

  if (isTransparentWrapper(reference, environment)) {
    const [wrapped] = typeArguments

    return wrapped === undefined
      ? null
      : unsafeDirectValue(wrapped, environment, substitutions, resolvingAliases)
  }

  const substitution = substitutionFor(reference, substitutions)

  if (substitution !== undefined) {
    return unsafeDirectValue(
      substitution.type,
      environment,
      substitution.substitutions,
      resolvingAliases
    )
  }

  const interfaceDeclarations = localInterfaces(reference, environment)

  if (interfaceDeclarations.length > 0) {
    return isEffectivelyEmptyInterface(interfaceDeclarations) ? "empty-object" : null
  }

  const alias = localAlias(reference, environment)

  if (alias === null || resolvingAliases.has(name)) return null
  const nextSubstitutions = aliasSubstitution(alias, typeArguments, substitutions)

  if (nextSubstitutions === null) return null
  const nextResolving = new Set(resolvingAliases)
  nextResolving.add(name)

  return unsafeDirectValue(alias.typeAnnotation, environment, nextSubstitutions, nextResolving)
}

function dictionaryValueTypes(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>
): readonly ResolvedType[] {
  const unwrapped = unwrapTransparentType(type)

  if (unwrapped.type === "TSTypeLiteral") {
    return unwrapped.members.flatMap((member): readonly ResolvedType[] =>
      member.type === "TSIndexSignature"
        ? [{ substitutions, type: member.typeAnnotation.typeAnnotation }]
        : []
    )
  }

  if (unwrapped.type === "TSMappedType") {
    return unwrapped.typeAnnotation === null
      || keyBreadth(unwrapped.constraint, environment, substitutions) === "finite"
      ? []
      : [{ substitutions, type: unwrapped.typeAnnotation }]
  }

  if (unwrapped.type !== "TSTypeReference") return []
  const reference = namedTypeReference(unwrapped)

  return reference === null
    ? []
    : referenceValueTypes(reference, environment, substitutions, resolvingAliases)
}

function referenceValueTypes(
  reference: NamedTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>
): readonly ResolvedType[] {
  const { name, typeArguments } = reference
  const substitution = substitutionFor(reference, substitutions)

  if (substitution !== undefined) {
    return dictionaryValueTypes(
      substitution.type,
      environment,
      substitution.substitutions,
      resolvingAliases
    )
  }

  if (isTransparentWrapper(reference, environment)) {
    const [wrapped] = typeArguments

    return wrapped === undefined
      ? []
      : dictionaryValueTypes(wrapped, environment, substitutions, resolvingAliases)
  }

  if (isBuiltIn(reference, "Record", environment)) {
    const value = typeArguments[1]

    return value === undefined
      || recordKeyBreadth(reference, environment, substitutions) === "finite"
      ? []
      : [{ substitutions, type: value }]
  }

  if (isBuiltIn(reference, "Pick", environment) || isBuiltIn(reference, "Omit", environment)) {
    const [source] = typeArguments

    return source === undefined
      ? []
      : dictionaryValueTypes(source, environment, substitutions, resolvingAliases)
  }

  const alias = localAlias(reference, environment)

  if (alias === null || resolvingAliases.has(name)) return []
  const nextSubstitutions = aliasSubstitution(alias, typeArguments, substitutions)

  if (nextSubstitutions === null) return []
  const nextResolving = new Set(resolvingAliases)
  nextResolving.add(name)

  return dictionaryValueTypes(alias.typeAnnotation, environment, nextSubstitutions, nextResolving)
}

type GenericDeclaration =
  | ESTree.Class
  | ESTree.TSInterfaceDeclaration
  | ESTree.TSTypeAliasDeclaration

function enclosingGenericDeclaration(node: ESTree.Node): GenericDeclaration | null {
  let current: ESTree.Node | null = node.parent

  while (current !== null && current.type !== "Program") {
    if (
      current.type === "TSTypeAliasDeclaration"
      || current.type === "TSInterfaceDeclaration"
      || current.type === "ClassDeclaration"
      || current.type === "ClassExpression"
    ) {
      return current
    }

    current = current.parent
  }

  return null
}

/**
 * Bind the type parameters of the enclosing declaration to their defaults. A plain use of the
 * declaration, such as `Bag` for `type Bag<T = unknown> = Record<string, T>`, gets these types, so
 * the declaration states them. A closer binder with the same name hides a parameter.
 */
function defaultTypeArguments(node: ESTree.Node, environment: TypeEnvironment) {
  const declaration = enclosingGenericDeclaration(node)
  const defaults = new Map<string, ResolvedType>()

  if (declaration === null) return defaults
  const hidden = lexicalTypeParameterNames(node, environment.typeAliases.visitorKeys, declaration)

  for (const parameter of declaration.typeParameters?.params ?? []) {
    const name = parameter.name.name

    if (parameter.default === null || hidden.has(name)) continue
    defaults.set(name, { substitutions: new Map(defaults), type: parameter.default })
  }

  return defaults
}

function classifyValueTypes(
  valueTypes: readonly ResolvedType[],
  environment: TypeEnvironment
): UnsafeDictionary | null {
  for (const valueType of valueTypes) {
    const unsafeValue = unsafeDirectValue(
      valueType.type,
      environment,
      valueType.substitutions,
      new Set()
    )

    if (unsafeValue !== null) return { kind: "unsafe-dictionary", unsafeValue }
  }

  return null
}

export function classifyUnsafeDictionaryValue(
  valueType: ESTree.TSType,
  environment: TypeEnvironment
): UnsafeDictionary | null {
  return classifyValueTypes(
    [{ substitutions: defaultTypeArguments(valueType, environment), type: valueType }],
    environment
  )
}

export function classifyUnsafeDictionary(
  type: ESTree.TSType,
  environment: TypeEnvironment
): UnsafeDictionary | null {
  const substitutions = defaultTypeArguments(type, environment)

  return classifyValueTypes(
    dictionaryValueTypes(type, environment, substitutions, new Set()),
    environment
  )
}

/**
 * Classify the type that an interface `extends` clause or a class `implements` clause names.
 */
export function classifyUnsafeHeritage(
  heritage: ESTree.TSClassImplements | ESTree.TSInterfaceHeritage,
  environment: TypeEnvironment
): UnsafeDictionary | null {
  const reference = namedTypeReference(heritage)

  if (reference === null) return null
  const substitutions = defaultTypeArguments(heritage, environment)

  return classifyValueTypes(
    referenceValueTypes(reference, environment, substitutions, new Set()),
    environment
  )
}

export function classifyWideningTarget(
  type: ESTree.TSType,
  environment: TypeEnvironment
): WideningTarget | null {
  const unwrapped = unwrapTransparentType(type)

  if (unwrapped.type === "TSUnknownKeyword") return { kind: "unknown" }

  if (unwrapped.type === "TSObjectKeyword") return { kind: "object" }

  if (unwrapped.type === "TSTypeLiteral") {
    return unwrapped.members.some((member) => member.type === "TSIndexSignature")
      ? { kind: "open dictionary" }
      : unwrapped.members.length > 0
        ? { kind: "anonymous object" }
        : null
  }

  if (unwrapped.type === "TSMappedType") {
    return keyBreadth(unwrapped.constraint, environment, new Map()) === "broad"
      ? { kind: "open dictionary" }
      : null
  }

  if (unwrapped.type !== "TSTypeReference") return null
  const reference = namedTypeReference(unwrapped)

  if (reference === null) return null
  const [wrapped] = reference.typeArguments

  if (isTransparentWrapper(reference, environment)) {
    return wrapped === undefined ? null : classifyWideningTarget(wrapped, environment)
  }

  const resolved = classifyReferenceBroadTarget(reference, environment, new Map(), new Set())

  const declaration =
    localAlias(reference, environment) ?? localInterfaces(reference, environment)[0]

  // A generic named type is a container for the caller's values, and its other broad targets
  // depend on the type argument.
  if (declaration === undefined || !hasTypeParameters(declaration)) return resolved

  return resolved?.kind === "open dictionary" ? { kind: "generic container" } : null
}

/**
 * Return whether an interface accepts any key, through an index signature of its own or through a
 * type it extends.
 */
function isOpenInterface(
  declarations: readonly ESTree.TSInterfaceDeclaration[],
  environment: TypeEnvironment,
  resolvingAliases: ReadonlySet<string>
): boolean {
  return declarations.some(
    (declaration) =>
      declaration.body.body.some((member) => member.type === "TSIndexSignature")
      || declaration.extends.some((heritage) => {
        const reference = namedTypeReference(heritage)

        return (
          reference !== null
          && classifyReferenceBroadTarget(reference, environment, new Map(), resolvingAliases)?.kind
            === "open dictionary"
        )
      })
  )
}

function classifyAliasBroadTarget(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>
): WideningTarget | null {
  const unwrapped = unwrapTransparentType(type)

  if (unwrapped.type === "TSUnknownKeyword") return { kind: "unknown" }

  if (unwrapped.type === "TSObjectKeyword") return { kind: "object" }

  if (unwrapped.type === "TSTypeLiteral") {
    return unwrapped.members.some((member) => member.type === "TSIndexSignature")
      ? { kind: "open dictionary" }
      : null
  }

  if (unwrapped.type === "TSMappedType") {
    return keyBreadth(unwrapped.constraint, environment, substitutions) === "broad"
      ? { kind: "open dictionary" }
      : null
  }

  if (unwrapped.type !== "TSTypeReference") return null
  const reference = namedTypeReference(unwrapped)

  return reference === null
    ? null
    : classifyReferenceBroadTarget(reference, environment, substitutions, resolvingAliases)
}

function classifyReferenceBroadTarget(
  reference: NamedTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  resolvingAliases: ReadonlySet<string>
): WideningTarget | null {
  const { name, typeArguments } = reference
  const substitution = substitutionFor(reference, substitutions)

  if (substitution !== undefined) {
    return classifyAliasBroadTarget(
      substitution.type,
      environment,
      substitution.substitutions,
      resolvingAliases
    )
  }

  if (isTransparentWrapper(reference, environment)) {
    const [wrapped] = typeArguments

    return wrapped === undefined
      ? null
      : classifyAliasBroadTarget(wrapped, environment, substitutions, resolvingAliases)
  }

  if (isBuiltIn(reference, "Record", environment)) {
    return recordKeyBreadth(reference, environment, substitutions) === "broad"
      ? { kind: "open dictionary" }
      : null
  }

  if (resolvingAliases.has(name)) return null
  const nextResolving = new Set(resolvingAliases)
  nextResolving.add(name)
  const alias = localAlias(reference, environment)

  if (alias === null) {
    return isOpenInterface(localInterfaces(reference, environment), environment, nextResolving)
      ? { kind: "open dictionary" }
      : null
  }

  const nextSubstitutions = aliasSubstitution(alias, typeArguments, substitutions)

  if (nextSubstitutions === null) return null

  return classifyAliasBroadTarget(
    alias.typeAnnotation,
    environment,
    nextSubstitutions,
    nextResolving
  )
}

export function isPopulatedObjectExpression(expression: ESTree.Expression): boolean {
  let current = expression

  while (
    current.type === "ParenthesizedExpression"
    || current.type === "TSAsExpression"
    || current.type === "TSTypeAssertion"
    || current.type === "TSNonNullExpression"
  ) {
    current = current.expression
  }

  return current.type === "ObjectExpression" && current.properties.length > 0
}

export function isKnownEvidenceExpression(expression: ESTree.Expression): boolean {
  let current = expression

  while (
    current.type === "ParenthesizedExpression"
    || current.type === "TSAsExpression"
    || current.type === "TSTypeAssertion"
    || current.type === "TSNonNullExpression"
    || current.type === "TSSatisfiesExpression"
  ) {
    current = current.expression
  }

  if (current.type === "ObjectExpression") return true

  return (
    current.type === "ArrayExpression"
    || current.type === "ArrowFunctionExpression"
    || current.type === "ClassExpression"
    || current.type === "FunctionExpression"
    || current.type === "NewExpression"
    || current.type === "Literal"
    || current.type === "TemplateLiteral"
    || current.type === "UnaryExpression"
  )
}
