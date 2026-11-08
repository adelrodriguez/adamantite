import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import { parseSync, type Expression, type ObjectProperty, Visitor } from "oxc-parser"
import type { Finding } from "#lib/integrations/base.ts"
import type { Project } from "#lib/workspace/project.ts"

function getPropertyName(property: ObjectProperty) {
  if (property.computed) {
    return
  }

  return property.key.type === "Identifier"
    ? property.key.name
    : property.key.type === "Literal" && Predicate.isString(property.key.value)
      ? property.key.value
      : undefined
}

interface SourceValue {
  readonly type: "value"
  readonly file: string
  readonly expression: Expression
}

type Binding =
  | SourceValue
  | { readonly type: "export"; readonly file: string; readonly name: string }

function readModule(
  source: Project["customRules"]["sources"][number],
  imports: Project["customRules"]["resolvedImports"]
) {
  const { file, content } = source
  const json = file.endsWith(".json")
  const parsed = parseSync(json ? `${file}.ts` : file, json ? `(${content})` : content, {
    preserveParens: false,
    sourceType: "module",
  })

  if (parsed.errors.length > 0) {
    return
  }

  const bindings = new Map<string, Binding>()
  const exports = new Map<string, Binding>()
  const targets = new Map(
    imports.filter((item) => item.from === file).map((item) => [item.specifier, item.file])
  )

  for (const statement of parsed.program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement

    if (declaration?.type === "VariableDeclaration" && declaration.kind === "const") {
      for (const variable of declaration.declarations) {
        if (variable.id.type === "Identifier" && variable.init !== null) {
          const value: SourceValue = { expression: variable.init, file, type: "value" }
          bindings.set(variable.id.name, value)
          if (statement.type === "ExportNamedDeclaration") {
            exports.set(variable.id.name, value)
          }
        }
      }
    }

    if (statement.type === "ImportDeclaration" && statement.importKind !== "type") {
      const target = targets.get(statement.source.value)
      if (target === undefined) {
        continue
      }
      for (const specifier of statement.specifiers) {
        if (specifier.type === "ImportDefaultSpecifier") {
          bindings.set(specifier.local.name, { file: target, name: "default", type: "export" })
        } else if (specifier.type === "ImportSpecifier" && specifier.importKind !== "type") {
          const name =
            specifier.imported.type === "Identifier"
              ? specifier.imported.name
              : specifier.imported.value
          bindings.set(specifier.local.name, { file: target, name, type: "export" })
        }
      }
    }

    if (statement.type === "ExportDefaultDeclaration") {
      const value = statement.declaration
      if (
        value.type !== "FunctionDeclaration"
        && value.type !== "ClassDeclaration"
        && value.type !== "TSInterfaceDeclaration"
      ) {
        exports.set("default", { expression: value, file, type: "value" })
      }
    } else if (json && statement.type === "ExpressionStatement") {
      exports.set("default", { expression: statement.expression, file, type: "value" })
    } else if (statement.type === "ExportNamedDeclaration") {
      for (const specifier of statement.specifiers) {
        const name =
          specifier.exported.type === "Identifier"
            ? specifier.exported.name
            : specifier.exported.value
        const target = statement.source === null ? undefined : targets.get(statement.source.value)
        if (target !== undefined) {
          exports.set(name, {
            file: target,
            name:
              specifier.local.type === "Identifier" ? specifier.local.name : specifier.local.value,
            type: "export",
          })
        } else if (specifier.local.type === "Identifier") {
          exports.set(name, { expression: specifier.local, file, type: "value" })
        }
      }
    }
  }

  return { bindings, exports, file, program: parsed.program }
}

type SourceModule = NonNullable<ReturnType<typeof readModule>>

function resolve(value: SourceValue, modules: ReadonlyMap<string, SourceModule>) {
  let current: Binding | undefined = value
  const visited = new Set<Binding | Expression>()

  while (current !== undefined) {
    const key = current.type === "value" ? current.expression : current
    if (visited.has(key)) {
      return
    }
    visited.add(key)

    if (current.type === "export") {
      current = modules.get(current.file)?.exports.get(current.name)
      continue
    }

    const expression = current.expression
    if (expression.type === "Identifier") {
      current = modules.get(current.file)?.bindings.get(expression.name)
    } else if (
      expression.type === "TSAsExpression"
      || expression.type === "TSSatisfiesExpression"
      || expression.type === "TSNonNullExpression"
    ) {
      current = { ...current, expression: expression.expression }
    } else {
      return current
    }
  }

  return current
}

function findLegacyNodes(
  value: SourceValue,
  modules: ReadonlyMap<string, SourceModule>,
  visited = new Set<Expression>()
): string[] {
  const object = value.expression
  if (object.type !== "ObjectExpression" || visited.has(object)) {
    return []
  }
  visited.add(object)

  const property = object.properties.find(
    (item) => item.type === "Property" && getPropertyName(item) === "layers"
  )
  if (property?.type !== "Property") {
    return []
  }

  const layers = resolve({ ...value, expression: property.value }, modules)
  if (layers?.expression.type !== "ObjectExpression") {
    return []
  }

  return layers.expression.properties.flatMap((node) => {
    if (node.type !== "Property") {
      return []
    }
    const child = resolve({ ...layers, expression: node.value }, modules)
    if (child === undefined) {
      return []
    }
    return child.expression.type === "ArrayExpression"
      ? [child.file]
      : findLegacyNodes(child, modules, visited)
  })
}

function findLegacyLayerMaps(modules: ReadonlyMap<string, SourceModule>) {
  const files = new Set<string>()

  for (const module of modules.values()) {
    const visitor = new Visitor({
      ObjectExpression(object) {
        for (const property of object.properties) {
          if (property.type !== "Property" || getPropertyName(property) !== "adamantite/layers") {
            continue
          }
          const value = resolve(
            { expression: property.value, file: module.file, type: "value" },
            modules
          )
          if (value?.expression.type !== "ArrayExpression") {
            continue
          }
          for (const element of value.expression.elements) {
            if (element === null || element.type === "SpreadElement") {
              continue
            }
            const option = resolve({ ...value, expression: element }, modules)
            if (option !== undefined) {
              for (const file of findLegacyNodes(option, modules)) {
                files.add(file)
              }
            }
          }
        }
      },
    })
    visitor.visit(module.program)
  }

  return [...files]
}

/**
 * Inspect the source snapshot that config discovery already read. Doctor does not run configs or
 * modify their layer maps.
 */
export const assessLayerMaps = Effect.fn("assessLayerMaps")(function* (project: Project) {
  const path = yield* Path.Path
  const modules = new Map<string, SourceModule>()
  for (const source of project.customRules.sources) {
    const module = readModule(source, project.customRules.resolvedImports)
    if (module !== undefined) {
      modules.set(module.file, module)
    }
  }
  const sources = findLegacyLayerMaps(modules)

  if (sources.length === 0) {
    return []
  }

  return [
    {
      currentState: sources
        .map(
          (file) =>
            `\`${path.relative(project.cwd, file)}\` uses arrays for layer declarations in \`adamantite/layers\`.`
        )
        .join("\n"),
      goal: [
        'Replace each layer\'s dependency array with an object containing `imports`. For example, `workspace: ["shared"]` becomes `workspace: { imports: ["shared"] }`, and `shared: []` becomes `shared: { imports: [] }`.',
        "Preserve every dependency and its transitive permissions, rule severity, root, override, entry, ignore, isolation, type-import setting, and resolution condition. Keep independent branches separate. Do not add permissions or exemptions to make the config pass.",
        "Put an existing direct child map in its containing layer's `layers` property. Remove that child map's `root` and separate option object. Its folder name derives the child root. Keep the containing layer's `imports` as the parent's dependencies.",
        "Move the child map's `entries`, `ignore`, `isolate`, `ignoreTypes`, and `conditions` beside its nested `layers`. Each setting applies only to that child map. Parent exemptions do not skip child checks, and settings do not inherit.",
        "Keep separate roots when nesting would require a new intermediate map or change a glob's matched scope. Declare each concrete scope once. A child root uses the parent's actual matched folder, not a concatenated glob.",
        "Compare the allowed and forbidden imports before and after the edit. Keep the original config if a permission, scope, or setting cannot be preserved.",
        "Run `adamantite check`, verify representative allowed and forbidden imports, then run `adamantite doctor` again.",
      ],
      id: "layers-map-migration",
      integration: "oxlint",
      reference: {
        content: `"adamantite/layers": ["error", {
  root: "src",
  layers: {
    lib: {
      imports: [],
      layers: {
        shared: { imports: [] },
        workspace: { imports: ["shared"] },
      },
    },
    terminal: { imports: ["lib"] },
  },
}]`,
        language: "ts",
      },
      title: "Layer maps need explicit imports and nested declarations",
    } satisfies Finding,
  ]
})
