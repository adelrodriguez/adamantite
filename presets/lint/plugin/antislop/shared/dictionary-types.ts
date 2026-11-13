import type { ESTree } from "@oxlint/plugins"

import { lexicalTypeParameterNames } from "./lexical-type-parameters.ts"
import {
  createTypeAliasEnvironment,
  hasVisibleTypeBinding,
  namedTypeReference,
  visibleTypeAlias,
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
  readonly interfaces: ReadonlyMap<string, readonly ESTree.TSInterfaceDeclaration[]>
  readonly typeAliases: LexicalTypeAliasEnvironment
}

function declaredStatement(statement: ESTree.Statement): ESTree.Node | null {
  return statement.type === "ExportNamedDeclaration"
    || statement.type === "ExportDefaultDeclaration"
    ? (statement.declaration ?? null)
    : statement
}

export function createTypeEnvironment(
  program: ESTree.Program,
  visitorKeys: Readonly<Record<string, readonly string[]>>
): TypeEnvironment {
  const interfaces = new Map<string, ESTree.TSInterfaceDeclaration[]>()

  for (const statement of program.body) {
    const declaration = declaredStatement(statement)

    if (declaration?.type !== "TSInterfaceDeclaration") continue
    const declarations = interfaces.get(declaration.id.name) ?? []
    declarations.push(declaration)
    interfaces.set(declaration.id.name, declarations)
  }

  return {
    interfaces,
    typeAliases: createTypeAliasEnvironment(program, visitorKeys),
  }
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

  const interfaceDeclarations = reference.global ? undefined : environment.interfaces.get(name)

  if (interfaceDeclarations !== undefined) {
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

    return value === undefined ? [] : [{ substitutions, type: value }]
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

  if (unwrapped.type === "TSMappedType") return { kind: "open dictionary" }

  if (unwrapped.type !== "TSTypeReference") return null
  const reference = namedTypeReference(unwrapped)

  if (reference === null) return null
  const { name, typeArguments } = reference

  if (isTransparentWrapper(reference, environment)) {
    const [wrapped] = typeArguments

    return wrapped === undefined ? null : classifyWideningTarget(wrapped, environment)
  }

  if (isBuiltIn(reference, "Record", environment)) {
    return hasBroadRecordKey(reference, environment, new Map()) ? { kind: "open dictionary" } : null
  }

  const alias = localAlias(reference, environment)

  if (alias === null) return null

  if ((alias.typeParameters?.params.length ?? 0) > 0) {
    const substitutions = aliasSubstitution(alias, typeArguments, new Map())

    const resolved =
      substitutions === null
        ? null
        : classifyAliasBroadTarget(
            alias.typeAnnotation,
            environment,
            substitutions,
            new Set([name])
          )

    return resolved?.kind === "open dictionary" ? { kind: "generic container" } : null
  }

  const substitutions = aliasSubstitution(alias, typeArguments, new Map())

  if (substitutions === null) return null

  const resolved = classifyAliasBroadTarget(
    alias.typeAnnotation,
    environment,
    substitutions,
    new Set([name])
  )

  return resolved
}

function hasBroadRecordKey(
  reference: NamedTypeReference,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment
): boolean {
  const [key] = reference.typeArguments

  return key === undefined || isBroadMappedKey(key, environment, substitutions)
}

function isBroadMappedKey(
  type: ESTree.TSType,
  environment: TypeEnvironment,
  substitutions: TypeAliasEnvironment,
  visitedAliases: ReadonlySet<string> = new Set()
): boolean {
  const unwrapped = unwrapTransparentType(type)

  if (
    unwrapped.type === "TSStringKeyword"
    || unwrapped.type === "TSNumberKeyword"
    || unwrapped.type === "TSSymbolKeyword"
  ) {
    return true
  }

  if (unwrapped.type === "TSUnionType") {
    return unwrapped.types.some((member) =>
      isBroadMappedKey(member, environment, substitutions, visitedAliases)
    )
  }

  if (unwrapped.type !== "TSTypeReference") return false
  const reference = namedTypeReference(unwrapped)

  if (reference === null) return false
  const { name } = reference
  const substitution = substitutionFor(reference, substitutions)

  if (substitution !== undefined) {
    return isBroadMappedKey(
      substitution.type,
      environment,
      substitution.substitutions,
      visitedAliases
    )
  }

  if (isBuiltIn(reference, "PropertyKey", environment)) return true
  const alias = localAlias(reference, environment)

  if (
    alias === null
    || (alias.typeParameters?.params.length ?? 0) > 0
    || visitedAliases.has(name)
  ) {
    return false
  }

  const nextVisited = new Set(visitedAliases)
  nextVisited.add(name)

  return isBroadMappedKey(alias.typeAnnotation, environment, new Map(), nextVisited)
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
    return isBroadMappedKey(unwrapped.constraint, environment, substitutions)
      ? { kind: "open dictionary" }
      : null
  }

  if (unwrapped.type !== "TSTypeReference") return null
  const reference = namedTypeReference(unwrapped)

  if (reference === null) return null
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
    return hasBroadRecordKey(reference, environment, substitutions)
      ? { kind: "open dictionary" }
      : null
  }

  const alias = localAlias(reference, environment)

  if (alias === null || resolvingAliases.has(name)) return null
  const nextSubstitutions = aliasSubstitution(alias, typeArguments, substitutions)

  if (nextSubstitutions === null) return null
  const nextResolving = new Set(resolvingAliases)
  nextResolving.add(name)

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
