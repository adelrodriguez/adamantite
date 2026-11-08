import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import {
  parseSync,
  type Expression,
  type ObjectExpression,
  type ObjectProperty,
  Visitor,
} from "oxc-parser"
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

function resolve(expression: Expression, bindings: ReadonlyMap<string, Expression>) {
  let current: Expression | undefined = expression
  const visited = new Set<string>()

  while (current !== undefined) {
    if (current.type === "Identifier") {
      if (visited.has(current.name)) {
        return
      }

      visited.add(current.name)
      current = bindings.get(current.name)
    } else if (
      current.type === "TSAsExpression"
      || current.type === "TSSatisfiesExpression"
      || current.type === "TSNonNullExpression"
    ) {
      current = current.expression
    } else {
      return current
    }
  }

  return current
}

function readLayers(object: ObjectExpression, bindings: ReadonlyMap<string, Expression>) {
  const property = object.properties.find(
    (item) => item.type === "Property" && getPropertyName(item) === "layers"
  )

  if (property?.type !== "Property") {
    return
  }

  const value = resolve(property.value, bindings)

  return value?.type === "ObjectExpression" ? value : undefined
}

function hasLegacyNodes(
  object: ObjectExpression,
  bindings: ReadonlyMap<string, Expression>
): boolean {
  const layers = readLayers(object, bindings)

  return (
    layers?.properties.some((property) => {
      if (property.type !== "Property") {
        return false
      }

      const value = resolve(property.value, bindings)

      return (
        value?.type === "ArrayExpression"
        || (value?.type === "ObjectExpression" && hasLegacyNodes(value, bindings))
      )
    }) ?? false
  )
}

function hasLegacyLayerMaps(file: string, content: string) {
  const json = file.endsWith(".json")
  const parsed = parseSync(json ? `${file}.ts` : file, json ? `(${content})` : content, {
    preserveParens: false,
    sourceType: "module",
  })

  if (parsed.errors.length > 0) {
    return false
  }

  const bindings = new Map<string, Expression>()

  for (const statement of parsed.program.body) {
    const declaration =
      statement.type === "ExportNamedDeclaration" ? statement.declaration : statement

    if (declaration?.type !== "VariableDeclaration" || declaration.kind !== "const") {
      continue
    }

    for (const variable of declaration.declarations) {
      if (variable.id.type === "Identifier" && variable.init !== null) {
        bindings.set(variable.id.name, variable.init)
      }
    }
  }

  let legacy = false
  const visitor = new Visitor({
    ObjectExpression(object) {
      for (const property of object.properties) {
        if (property.type !== "Property" || getPropertyName(property) !== "adamantite/layers") {
          continue
        }

        const value = resolve(property.value, bindings)

        if (value?.type !== "ArrayExpression") {
          continue
        }

        legacy ||= value.elements.some((element) => {
          if (element === null || element.type === "SpreadElement") {
            return false
          }

          const option = resolve(element, bindings)

          return option?.type === "ObjectExpression" && hasLegacyNodes(option, bindings)
        })
      }
    },
  })

  visitor.visit(parsed.program)

  return legacy
}

/**
 * Inspect the source snapshot that config discovery already read. Doctor does not run configs or
 * modify their layer maps.
 */
export const assessLayerMaps = Effect.fn("assessLayerMaps")(function* (project: Project) {
  const path = yield* Path.Path
  const sources = project.customRules.sources.filter((source) =>
    hasLegacyLayerMaps(source.file, source.content)
  )

  if (sources.length === 0) {
    return []
  }

  return [
    {
      currentState: sources
        .map(
          (source) =>
            `\`${path.relative(project.cwd, source.file)}\` uses arrays for layer declarations in \`adamantite/layers\`.`
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
