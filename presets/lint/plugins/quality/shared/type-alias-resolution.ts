import type { Context, ESTree, Visitor } from "@oxlint/plugins"

import type { VisitorKeys } from "../../shared/ast.ts"
import { nearestTypeParameter, type LexicalTypeParameter } from "./lexical-type-parameters.ts"

type TypeScope = ESTree.Node

type TypeBinding = {
  readonly alias: ESTree.TSTypeAliasDeclaration | null
  readonly declaration: ESTree.Node
}

type Substitution = {
  readonly substitutions: Substitutions
  readonly type: ESTree.TSType
}

type Substitutions = ReadonlyMap<string, Substitution>

export type TypeAliasEnvironment = {
  readonly bindingsByName: ReadonlyMap<string, ReadonlyMap<TypeScope, readonly TypeBinding[]>>
  readonly visitorKeys: VisitorKeys
}

export type ResolvedTypeMatcher = (
  type: ESTree.TSType,
  matches: (child: ESTree.TSType) => boolean
) => boolean

export type DeferCheck = (check: (environment: TypeAliasEnvironment) => void) => void

type TypeBindingNode =
  | ESTree.Class
  | ESTree.ImportDefaultSpecifier
  | ESTree.ImportNamespaceSpecifier
  | ESTree.ImportSpecifier
  | ESTree.TSEnumDeclaration
  | ESTree.TSInterfaceDeclaration
  | ESTree.TSTypeAliasDeclaration

type BindingIndex = Map<string, Map<TypeScope, TypeBinding[]>>

const environmentsByProgram = new WeakMap<ESTree.Program, TypeAliasEnvironment>()

function enclosingTypeScope(node: ESTree.Node): TypeScope {
  let current: ESTree.Node | null = node.parent

  while (current !== null) {
    if (
      current.type === "Program"
      || current.type === "BlockStatement"
      || current.type === "TSModuleBlock"
      || current.type === "StaticBlock"
      || current.type === "SwitchStatement"
    ) {
      return current
    }

    current = current.parent
  }

  return node
}

function declaredName(node: TypeBindingNode): string | null {
  if (
    node.type === "ImportSpecifier"
    || node.type === "ImportDefaultSpecifier"
    || node.type === "ImportNamespaceSpecifier"
  ) {
    return node.local.name
  }

  return node.id?.name ?? null
}

function recordBinding(node: TypeBindingNode, bindingsByName: BindingIndex): void {
  const name = declaredName(node)

  if (name === null) {
    return
  }

  const scope = enclosingTypeScope(node)
  const scopes = bindingsByName.get(name) ?? new Map<TypeScope, TypeBinding[]>()
  const bindings = scopes.get(scope) ?? []
  bindings.push({ alias: node.type === "TSTypeAliasDeclaration" ? node : null, declaration: node })
  scopes.set(scope, bindings)
  bindingsByName.set(name, scopes)
}

export function withTypeBindings(
  context: Context,
  createVisitors: (defer: DeferCheck) => Visitor
): Visitor {
  const checks: Array<(environment: TypeAliasEnvironment) => void> = []

  const visitors = createVisitors((check) => {
    checks.push(check)
  })

  let bindingsByName: BindingIndex | null = null
  let environment: TypeAliasEnvironment | null = null

  function record(node: TypeBindingNode) {
    if (bindingsByName !== null) {
      recordBinding(node, bindingsByName)
    }
  }

  return {
    ...visitors,
    ClassDeclaration(node) {
      record(node)
      visitors.ClassDeclaration?.(node)
    },
    ClassExpression(node) {
      record(node)
      visitors.ClassExpression?.(node)
    },
    ImportDefaultSpecifier(node) {
      record(node)
      visitors.ImportDefaultSpecifier?.(node)
    },
    ImportNamespaceSpecifier(node) {
      record(node)
      visitors.ImportNamespaceSpecifier?.(node)
    },
    ImportSpecifier(node) {
      record(node)
      visitors.ImportSpecifier?.(node)
    },
    Program(node) {
      checks.length = 0
      environment = environmentsByProgram.get(node) ?? null
      bindingsByName = null

      if (environment === null) {
        bindingsByName = new Map()
        environment = { bindingsByName, visitorKeys: context.sourceCode.visitorKeys }
        environmentsByProgram.set(node, environment)
      }

      visitors.Program?.(node)
    },
    "Program:exit"(node) {
      visitors["Program:exit"]?.(node)

      if (environment !== null) {
        for (const check of checks) {
          check(environment)
        }
      }

      checks.length = 0
      bindingsByName = null
      environment = null
    },
    TSEnumDeclaration(node) {
      record(node)
      visitors.TSEnumDeclaration?.(node)
    },
    TSInterfaceDeclaration(node) {
      record(node)
      visitors.TSInterfaceDeclaration?.(node)
    },
    TSTypeAliasDeclaration(node) {
      record(node)
      visitors.TSTypeAliasDeclaration?.(node)
    },
  }
}

type NearestTypeBinding =
  | { readonly kind: "declared"; readonly bindings: readonly TypeBinding[] }
  | { readonly kind: "none" }
  | { readonly kind: "type-parameter"; readonly parameter: LexicalTypeParameter }

type DeclaredBindings = {
  readonly bindings: readonly TypeBinding[]
  readonly distance: number
}

const NO_DECLARED_BINDINGS: DeclaredBindings = { bindings: [], distance: Number.POSITIVE_INFINITY }

function nearestDeclaredBindings(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment
): DeclaredBindings {
  const scopes = environment.bindingsByName.get(name)

  if (scopes === undefined) {
    return NO_DECLARED_BINDINGS
  }

  let current: ESTree.Node | null = use
  let distance = 0

  while (current !== null) {
    const bindings = scopes.get(current)

    if (bindings !== undefined) {
      return { bindings, distance }
    }

    current = current.parent
    distance += 1
  }

  return NO_DECLARED_BINDINGS
}

// A type parameter and a declaration hide each other by scope, so the nearer one wins.
function nearestTypeBinding(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment
): NearestTypeBinding {
  const parameter = nearestTypeParameter(name, use, environment.visitorKeys)
  const declared = nearestDeclaredBindings(name, use, environment)

  if (parameter !== undefined && parameter.distance < declared.distance) {
    return { kind: "type-parameter", parameter }
  }

  return declared.bindings.length > 0
    ? { bindings: declared.bindings, kind: "declared" }
    : { kind: "none" }
}

export function visibleTypeAlias(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment
): ESTree.TSTypeAliasDeclaration | null {
  const nearest = nearestTypeBinding(name, use, environment)

  return nearest.kind === "declared" && nearest.bindings.length === 1
    ? (nearest.bindings[0]?.alias ?? null)
    : null
}

export function visibleInterfaces(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment
): readonly ESTree.TSInterfaceDeclaration[] {
  const nearest = nearestTypeBinding(name, use, environment)

  if (nearest.kind !== "declared") {
    return []
  }

  const interfaces = nearest.bindings.flatMap(({ declaration }) =>
    declaration.type === "TSInterfaceDeclaration" ? [declaration] : []
  )

  return interfaces.length === nearest.bindings.length ? interfaces : []
}

export function visibleTypeParameter(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment
): ESTree.TSTypeParameter | null {
  const nearest = nearestTypeBinding(name, use, environment)

  return nearest.kind === "type-parameter"
    && nearest.parameter.declaration.type === "TSTypeParameter"
    ? nearest.parameter.declaration
    : null
}

export function hasVisibleTypeBinding(
  name: string,
  use: ESTree.Node,
  environment: TypeAliasEnvironment
): boolean {
  return nearestTypeBinding(name, use, environment).kind !== "none"
}

export type NamedTypeReference = {
  readonly global: boolean
  readonly name: string
  readonly node: ESTree.Node
  readonly typeArguments: readonly ESTree.TSType[]
}

type TypeReferenceNode =
  | ESTree.TSClassImplements
  | ESTree.TSInterfaceHeritage
  | ESTree.TSTypeReference

function isGlobalThis(node: ESTree.Node): boolean {
  return node.type === "Identifier" && node.name === "globalThis"
}

function globalTypeName(target: ESTree.Expression | ESTree.TSTypeName): string | null {
  if (target.type === "TSQualifiedName") {
    return isGlobalThis(target.left) ? target.right.name : null
  }

  return target.type === "MemberExpression"
    && !target.computed
    && target.property.type === "Identifier"
    && isGlobalThis(target.object)
    ? target.property.name
    : null
}

export function namedTypeReference(node: TypeReferenceNode): NamedTypeReference | null {
  const target = node.type === "TSTypeReference" ? node.typeName : node.expression
  const typeArguments = node.typeArguments?.params ?? []

  if (target.type === "Identifier") {
    return { global: false, name: target.name, node, typeArguments }
  }

  const name = globalTypeName(target)

  return name === null ? null : { global: true, name, node, typeArguments }
}

// An alias body sees only its own type parameters. An explicit argument keeps the
// substitutions of the place that wrote it, and a default sees the parameters before it.
function aliasSubstitutions(
  alias: ESTree.TSTypeAliasDeclaration,
  reference: ESTree.TSTypeReference,
  base: Substitutions
): Substitutions | null {
  const parameters = alias.typeParameters?.params ?? []
  const arguments_ = reference.typeArguments?.params ?? []
  const next = new Map<string, Substitution>()

  for (const [index, parameter] of parameters.entries()) {
    const explicitArgument = arguments_[index]
    const argument = explicitArgument ?? parameter.default

    if (argument === null) {
      return null
    }

    const argumentSubstitutions = explicitArgument === undefined ? next : base
    next.set(parameter.name.name, {
      substitutions: new Map(argumentSubstitutions),
      type: argument,
    })
  }

  return next
}

export function resolvedTypeMatches(
  type: ESTree.TSType,
  environment: TypeAliasEnvironment,
  matcher: ResolvedTypeMatcher
): boolean {
  function evaluate(
    current: ESTree.TSType,
    substitutions: Substitutions,
    resolvingAliases: ReadonlySet<ESTree.TSTypeAliasDeclaration>
  ): boolean {
    if (current.type === "TSTypeReference") {
      const reference = namedTypeReference(current)
      const name = reference === null || reference.global ? null : reference.name

      if (name !== null) {
        const substitution = substitutions.get(name)

        if (substitution !== undefined && !current.typeArguments?.params.length) {
          return evaluate(substitution.type, substitution.substitutions, resolvingAliases)
        }

        const alias = visibleTypeAlias(name, current, environment)

        if (alias !== null && !resolvingAliases.has(alias)) {
          const nextSubstitutions = aliasSubstitutions(alias, current, substitutions)

          if (nextSubstitutions !== null) {
            const nextResolving = new Set(resolvingAliases)
            nextResolving.add(alias)

            return evaluate(alias.typeAnnotation, nextSubstitutions, nextResolving)
          }
        }
      }
    }

    return matcher(current, (child) => evaluate(child, substitutions, resolvingAliases))
  }

  return evaluate(type, new Map(), new Set())
}
