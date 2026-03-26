import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import { print as printAst } from "esrap"
import ts from "esrap/languages/ts"
import {
  parseSync,
  type ExportDefaultDeclaration,
  type ObjectExpression,
  type ObjectProperty,
  type Program,
  type PropertyKey,
} from "oxc-parser"
import { isJsonObject } from "#lib/shared/json.ts"

const REQUIRED_BOOLEAN_OPTIONS = ["typeAware", "typeCheck"] as const
const UNSUPPORTED_CONFIG_REASON =
  "`oxlint.config.ts` must export an object literal directly, with or without `defineConfig(...)`, for Adamantite to patch `options` safely."
const UNSUPPORTED_OPTIONS_REASON =
  "`oxlint.config.ts` has an `options` property, but it is not an object literal that Adamantite can patch safely."
const NON_BOOLEAN_OPTIONS_REASON =
  "`oxlint.config.ts` already defines `typeAware` or `typeCheck`, but not as a boolean literal Adamantite can safely patch."
const GENERATED_PATCH_FAILURE_REASON =
  "Adamantite could not generate the required `options.typeAware` and `options.typeCheck` patch."

type RequiredBooleanOption = (typeof REQUIRED_BOOLEAN_OPTIONS)[number]

type NamedObjectPropertyResult =
  | { readonly status: "found"; readonly property: ObjectProperty }
  | { readonly status: "manual" }
  | { readonly status: "missing" }

export type OxlintTypeAwarePatchResult =
  | { readonly kind: "configured" }
  | { readonly kind: "manual"; readonly reason: string }
  | { readonly kind: "patchable"; readonly updatedContent: string }

export function getOxlintPresetNames(presets: string[] = []) {
  return presets.includes("core") ? presets : ["core", ...presets]
}

function getImportName(preset: string) {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function toOxlintTsConfigContent(
  config: Record<string, unknown>,
  presetNames: string[],
  passthroughExtends: string[] = []
) {
  const { options, ...configWithoutOptions } = config
  const imports = [
    'import { defineConfig } from "oxlint"',
    ...presetNames.map(
      (preset) =>
        `import ${getImportName(preset)} from "${preset === "core" ? "adamantite/lint" : `adamantite/lint/${preset}`}"`
    ),
  ]

  const presetExtendItems = presetNames.map((preset) => getImportName(preset))
  const allExtends = [
    ...presetExtendItems,
    ...passthroughExtends.map((item) => JSON.stringify(item)),
  ]

  const serializedOptions = JSON.stringify(
    isJsonObject(options)
      ? {
          ...options,
          typeAware: true,
          typeCheck: true,
        }
      : {
          typeAware: true,
          typeCheck: true,
        },
    null,
    2
  )
  const serializedConfigEntries = Object.entries(configWithoutOptions).map(
    ([key, value]) => [key, JSON.stringify(value, null, 2)] as [string, string]
  )
  const serializedExtends = `[${allExtends.join(", ")}]`
  const body = [
    ["options", serializedOptions],
    ...serializedConfigEntries,
    ["extends", serializedExtends],
  ]
    .map(([key, value]) => `  ${key}: ${value},`)
    .join("\n")

  return [...imports, "", "export default defineConfig({", body, "})", ""].join("\n")
}

function isObjectExpression(value: unknown): value is ObjectExpression {
  return isJsonObject(value) && value.type === "ObjectExpression" && Array.isArray(value.properties)
}

function isObjectProperty(value: unknown): value is ObjectProperty {
  return isJsonObject(value) && value.type === "Property"
}

function parse(content: string) {
  return Effect.try({
    catch: () => null,
    try: () =>
      parseSync("oxlint.config.ts", content, {
        astType: "ts",
        lang: "ts",
        sourceType: "module",
      }),
  }).pipe(
    Effect.match({
      onFailure: () => Option.none<Program>(),
      onSuccess: (result) =>
        result.errors.length === 0 ? Option.fromNullishOr(result.program) : Option.none<Program>(),
    })
  )
}

function print(program: Program) {
  // @ts-expect-error - esrap's printer types do not yet accept oxc-parser's TS-ESTree program
  const { code } = printAst(program, ts({ quotes: "double" }))

  return code.endsWith("\n") ? code : `${code}\n`
}

function getStaticPropertyName(key: PropertyKey) {
  if (key.type === "Identifier") {
    return key.name
  }

  if (key.type === "Literal" && typeof key.value === "string") {
    return key.value
  }

  return null
}

function getExportedConfigObject(ast: Program) {
  const exportDefaultDeclarations = ast.body.filter(
    (statement): statement is ExportDefaultDeclaration =>
      statement.type === "ExportDefaultDeclaration"
  )

  if (exportDefaultDeclarations.length !== 1) {
    return Option.none()
  }

  const [exportDefaultDeclaration] = exportDefaultDeclarations

  if (!exportDefaultDeclaration) {
    return Option.none()
  }

  const declaration = exportDefaultDeclaration.declaration

  if (isObjectExpression(declaration)) {
    return Option.fromNullishOr(declaration)
  }

  if (declaration.type !== "CallExpression") {
    return Option.none()
  }

  if (declaration.callee.type !== "Identifier" || declaration.callee.name !== "defineConfig") {
    return Option.none()
  }

  if (declaration.arguments.length !== 1) {
    return Option.none()
  }

  const [firstArgument] = declaration.arguments

  if (isObjectExpression(firstArgument)) {
    return Option.fromNullishOr(firstArgument)
  }

  return Option.none()
}

function getNamedObjectProperty(
  objectExpression: ObjectExpression,
  propertyName: string
): NamedObjectPropertyResult {
  let matchedProperty: ObjectProperty | null = null

  for (const property of objectExpression.properties) {
    if (property.type === "SpreadElement") {
      return { status: "manual" }
    }

    if (!isObjectProperty(property)) {
      return { status: "manual" }
    }

    if (property.computed) {
      return { status: "manual" }
    }

    if (property.method || property.kind !== "init") {
      if (getStaticPropertyName(property.key) === propertyName) {
        return { status: "manual" }
      }

      continue
    }

    if (getStaticPropertyName(property.key) !== propertyName) {
      continue
    }

    if (matchedProperty) {
      return { status: "manual" }
    }

    matchedProperty = property
  }

  if (!matchedProperty) {
    return { status: "missing" }
  }

  return {
    property: matchedProperty,
    status: "found",
  }
}

function createRequiredOptionProperties(options: readonly RequiredBooleanOption[]) {
  const content = `export default { options: { ${options.map((option) => `${option}: true`).join(", ")} } }\n`

  return parse(content).pipe(
    Effect.map((parsed) => {
      if (Option.isNone(parsed)) {
        return Option.none()
      }

      const configObjectExpression = getExportedConfigObject(parsed.value)

      if (Option.isNone(configObjectExpression)) {
        return Option.none()
      }

      const optionsPropertyResult = getNamedObjectProperty(configObjectExpression.value, "options")

      if (optionsPropertyResult.status !== "found") {
        return Option.none()
      }

      if (!isObjectExpression(optionsPropertyResult.property.value)) {
        return Option.none()
      }

      const properties = optionsPropertyResult.property.value.properties.filter(isObjectProperty)

      return properties.length === optionsPropertyResult.property.value.properties.length
        ? Option.fromNullishOr(properties)
        : Option.none()
    })
  )
}

function createRequiredOptionsProperty() {
  const content = `export default { options: { ${REQUIRED_BOOLEAN_OPTIONS.map((option) => `${option}: true`).join(", ")} } }\n`

  return parse(content).pipe(
    Effect.map((parsed) => {
      if (Option.isNone(parsed)) {
        return Option.none()
      }

      const configObjectExpression = getExportedConfigObject(parsed.value)

      if (
        Option.isNone(configObjectExpression) ||
        configObjectExpression.value.properties.length !== 1
      ) {
        return Option.none()
      }

      const [property] = configObjectExpression.value.properties

      if (
        !property ||
        !isObjectProperty(property) ||
        property.computed ||
        property.method ||
        property.kind !== "init"
      ) {
        return Option.none()
      }

      return Option.fromNullishOr(property)
    })
  )
}

function patchOptionsObject(ast: Program, optionsObjectExpression: ObjectExpression) {
  return Effect.gen(function* () {
    const missingOptions: RequiredBooleanOption[] = []
    let changed = false

    for (const option of REQUIRED_BOOLEAN_OPTIONS) {
      const propertyResult = getNamedObjectProperty(optionsObjectExpression, option)

      if (propertyResult.status === "manual") {
        return {
          kind: "manual",
          reason: NON_BOOLEAN_OPTIONS_REASON,
        } satisfies OxlintTypeAwarePatchResult
      }

      if (propertyResult.status === "missing") {
        missingOptions.push(option)
        continue
      }

      const value = propertyResult.property.value

      if (value.type !== "Literal" || typeof value.value !== "boolean") {
        return {
          kind: "manual",
          reason: NON_BOOLEAN_OPTIONS_REASON,
        } satisfies OxlintTypeAwarePatchResult
      }

      if (value.value) {
        continue
      }

      value.raw = "true"
      value.value = true
      changed = true
    }

    if (missingOptions.length > 0) {
      const generatedOptionProperties = yield* createRequiredOptionProperties(missingOptions)

      if (Option.isNone(generatedOptionProperties)) {
        return {
          kind: "manual",
          reason: GENERATED_PATCH_FAILURE_REASON,
        } satisfies OxlintTypeAwarePatchResult
      }

      optionsObjectExpression.properties.unshift(...generatedOptionProperties.value)
      changed = true
    }

    if (!changed) {
      return { kind: "configured" } satisfies OxlintTypeAwarePatchResult
    }

    return {
      kind: "patchable",
      updatedContent: print(ast),
    } satisfies OxlintTypeAwarePatchResult
  })
}

export function inspectTypeAwareOxlintConfig(content: string) {
  return Effect.gen(function* () {
    const parsed = yield* parse(content)

    if (Option.isNone(parsed)) {
      return {
        kind: "manual",
        reason: UNSUPPORTED_CONFIG_REASON,
      } satisfies OxlintTypeAwarePatchResult
    }

    const configObjectExpression = getExportedConfigObject(parsed.value)

    if (Option.isNone(configObjectExpression)) {
      return {
        kind: "manual",
        reason: UNSUPPORTED_CONFIG_REASON,
      } satisfies OxlintTypeAwarePatchResult
    }

    const optionsPropertyResult = getNamedObjectProperty(configObjectExpression.value, "options")

    if (optionsPropertyResult.status === "manual") {
      return {
        kind: "manual",
        reason: UNSUPPORTED_OPTIONS_REASON,
      } satisfies OxlintTypeAwarePatchResult
    }

    if (optionsPropertyResult.status === "missing") {
      const optionsProperty = yield* createRequiredOptionsProperty()

      if (Option.isNone(optionsProperty)) {
        return {
          kind: "manual",
          reason: GENERATED_PATCH_FAILURE_REASON,
        } satisfies OxlintTypeAwarePatchResult
      }

      configObjectExpression.value.properties.unshift(optionsProperty.value)

      return {
        kind: "patchable",
        updatedContent: print(parsed.value),
      } satisfies OxlintTypeAwarePatchResult
    }

    if (!isObjectExpression(optionsPropertyResult.property.value)) {
      return {
        kind: "manual",
        reason: UNSUPPORTED_OPTIONS_REASON,
      } satisfies OxlintTypeAwarePatchResult
    }

    return yield* patchOptionsObject(parsed.value, optionsPropertyResult.property.value)
  })
}
