import type { JsonObject, JsonValue } from "type-fest"
import * as Array from "effect/Array"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Predicate from "effect/Predicate"
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
import { ignorePatterns as coreIgnorePatterns } from "#presets/lint/core.ts"

const REQUIRED_BOOLEAN_OPTIONS = [
  "respectEslintDisableDirectives",
  "typeAware",
  "typeCheck",
] as const
const UNSUPPORTED_CONFIG_REASON =
  "`oxlint.config.ts` must export an object literal directly, with or without `defineConfig(...)`, for Adamantite to patch `options` safely."
const UNSUPPORTED_OPTIONS_REASON =
  "`oxlint.config.ts` has an `options` property, but it is not an object literal that Adamantite can patch safely."
const NON_BOOLEAN_OPTIONS_REASON =
  "`oxlint.config.ts` has an `options` object Adamantite cannot patch safely. Make sure each required option is a plain `key: true | false` property—avoid spreads (`...rest`), computed keys (`[name]: ...`), duplicate keys, methods/getters/setters, and non-boolean-literal values."

type RequiredBooleanOption = (typeof REQUIRED_BOOLEAN_OPTIONS)[number]

type NamedObjectPropertyResult =
  | { readonly status: "found"; readonly property: ObjectProperty }
  | { readonly status: "manual" }
  | { readonly status: "missing" }

export type OxlintRequiredOptionsPatchResult =
  | { readonly kind: "configured" }
  | { readonly kind: "manual"; readonly reason: string }
  | { readonly kind: "patchable"; readonly updatedContent: string }

export function getOxlintPresetNames(presets: string[] = []) {
  return presets.includes("core") ? presets : ["core", ...presets]
}

function getImportName(preset: string) {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

// Matches the core preset's `sort-keys` configuration: ascending and case-sensitive.
const byEntryKey = Order.mapInput(Order.String, (entry: readonly [string, unknown]) => entry[0])

// Oxlint does not merge `ignorePatterns` from extended configs, so the generated config
// hoists the core preset's patterns to the root, appending any project-specific patterns.
function serializeIgnorePatterns(ignorePatterns: JsonValue | undefined) {
  const extraPatterns = (Array.isArray(ignorePatterns) ? ignorePatterns : [])
    .filter((pattern): pattern is string => Predicate.isString(pattern))
    .filter((pattern) => !coreIgnorePatterns.includes(pattern))

  if (extraPatterns.length === 0) {
    return "core.ignorePatterns"
  }

  return `[...core.ignorePatterns, ${extraPatterns.map((pattern) => JSON.stringify(pattern)).join(", ")}]`
}

export function toOxlintTsConfigContent(
  config: JsonObject,
  presetNames: string[],
  passthroughExtends: string[] = []
) {
  const { ignorePatterns, options, ...configWithoutOptions } = config
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

  const mergedOptions: JsonObject = Predicate.isObject(options) ? { ...options } : {}
  mergedOptions.respectEslintDisableDirectives = true
  mergedOptions.typeAware = true
  mergedOptions.typeCheck = true

  const serializedOptions = JSON.stringify(
    Object.fromEntries(Array.sort(Object.entries(mergedOptions), byEntryKey)),
    null,
    2
  )
  const serializedConfigEntries = Object.entries(configWithoutOptions).map(
    ([key, value]): [string, string] => [key, JSON.stringify(value, null, 2)]
  )
  const serializedExtends = `[${allExtends.join(", ")}]`
  // The core preset enables `sort-keys`, so the generated config must emit its own keys in
  // sorted order or a fresh `adamantite check` fails on the file init just wrote.
  const entries: Array<[string, string]> = [
    ["extends", serializedExtends],
    ["ignorePatterns", serializeIgnorePatterns(ignorePatterns)],
    ["options", serializedOptions],
    ...serializedConfigEntries,
  ]
  const body = Array.sort(entries, byEntryKey)
    .map(([key, value]) => `  ${key}: ${value},`)
    .join("\n")

  return [...imports, "", "export default defineConfig({", body, "})", ""].join("\n")
}

const parseThrowable = Option.liftThrowable((content: string) =>
  parseSync("oxlint.config.ts", content, {
    astType: "ts",
    lang: "ts",
    sourceType: "module",
  })
)

function parse(content: string) {
  return parseThrowable(content).pipe(
    Option.flatMap((result) =>
      result.errors.length === 0 ? Option.fromNullishOr(result.program) : Option.none<Program>()
    )
  )
}

function print(program: Program) {
  const { code } = printAst(program, ts({ quotes: "double" }))

  return code.endsWith("\n") ? code : `${code}\n`
}

function getStaticPropertyName(key: PropertyKey) {
  if (key.type === "Identifier") {
    return pipe(key.name, Option.some)
  }

  if (key.type === "Literal" && Predicate.isString(key.value)) {
    return pipe(key.value, Option.some)
  }

  return Option.none<string>()
}

function getConfigObjectExpression(declaration: ExportDefaultDeclaration["declaration"]) {
  if (declaration.type === "ObjectExpression") {
    return pipe(declaration, Option.some)
  }

  if (
    declaration.type !== "CallExpression" ||
    declaration.callee.type !== "Identifier" ||
    declaration.callee.name !== "defineConfig"
  ) {
    return Option.none<ObjectExpression>()
  }

  return pipe(
    declaration.arguments.length === 1 ? Array.head(declaration.arguments) : Option.none(),
    Option.filter((argument): argument is ObjectExpression => argument.type === "ObjectExpression")
  )
}

function getExportedConfigObject(ast: Program) {
  return pipe(
    ast.body,
    Array.filter(
      (statement): statement is ExportDefaultDeclaration =>
        statement.type === "ExportDefaultDeclaration"
    ),
    (declarations) => (declarations.length === 1 ? Array.head(declarations) : Option.none()),
    Option.flatMap((exported) => getConfigObjectExpression(exported.declaration))
  )
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

    if (property.computed) {
      return { status: "manual" }
    }

    const nameMatches = Option.contains(getStaticPropertyName(property.key), propertyName)

    if (property.method || property.kind !== "init") {
      if (nameMatches) {
        return { status: "manual" }
      }

      continue
    }

    if (!nameMatches) {
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

function createBooleanOptionProperty(option: RequiredBooleanOption): ObjectProperty {
  return {
    computed: false,
    end: 0,
    key: { end: 0, name: option, start: 0, type: "Identifier" },
    kind: "init",
    method: false,
    shorthand: false,
    start: 0,
    type: "Property",
    value: { end: 0, raw: "true", start: 0, type: "Literal", value: true },
  }
}

function createRequiredOptionsProperty(): ObjectProperty {
  return {
    computed: false,
    end: 0,
    key: { end: 0, name: "options", start: 0, type: "Identifier" },
    kind: "init",
    method: false,
    shorthand: false,
    start: 0,
    type: "Property",
    value: {
      end: 0,
      properties: REQUIRED_BOOLEAN_OPTIONS.map((option) => createBooleanOptionProperty(option)),
      start: 0,
      type: "ObjectExpression",
    },
  }
}

function patchOptionsObject(ast: Program, optionsObjectExpression: ObjectExpression) {
  const missingOptions: RequiredBooleanOption[] = []
  let changed = false

  for (const option of REQUIRED_BOOLEAN_OPTIONS) {
    const propertyResult = getNamedObjectProperty(optionsObjectExpression, option)

    if (propertyResult.status === "manual") {
      return {
        kind: "manual",
        reason: NON_BOOLEAN_OPTIONS_REASON,
      } satisfies OxlintRequiredOptionsPatchResult
    }

    if (propertyResult.status === "missing") {
      missingOptions.push(option)
      continue
    }

    const value = propertyResult.property.value

    if (value.type !== "Literal" || !Predicate.isBoolean(value.value)) {
      return {
        kind: "manual",
        reason: NON_BOOLEAN_OPTIONS_REASON,
      } satisfies OxlintRequiredOptionsPatchResult
    }

    if (value.value) {
      continue
    }

    value.raw = "true"
    value.value = true
    changed = true
  }

  if (missingOptions.length > 0) {
    optionsObjectExpression.properties.unshift(
      ...missingOptions.map((option) => createBooleanOptionProperty(option))
    )
    changed = true
  }

  if (!changed) {
    return { kind: "configured" } satisfies OxlintRequiredOptionsPatchResult
  }

  return {
    kind: "patchable",
    updatedContent: print(ast),
  } satisfies OxlintRequiredOptionsPatchResult
}

export function inspectRequiredOxlintConfig(content: string) {
  const parsed = parse(content)

  if (Option.isNone(parsed)) {
    return {
      kind: "manual",
      reason: UNSUPPORTED_CONFIG_REASON,
    } satisfies OxlintRequiredOptionsPatchResult
  }

  const configObjectExpression = getExportedConfigObject(parsed.value)

  if (Option.isNone(configObjectExpression)) {
    return {
      kind: "manual",
      reason: UNSUPPORTED_CONFIG_REASON,
    } satisfies OxlintRequiredOptionsPatchResult
  }

  const optionsPropertyResult = getNamedObjectProperty(configObjectExpression.value, "options")

  if (optionsPropertyResult.status === "manual") {
    return {
      kind: "manual",
      reason: UNSUPPORTED_OPTIONS_REASON,
    } satisfies OxlintRequiredOptionsPatchResult
  }

  if (optionsPropertyResult.status === "missing") {
    configObjectExpression.value.properties.unshift(createRequiredOptionsProperty())

    return {
      kind: "patchable",
      updatedContent: print(parsed.value),
    } satisfies OxlintRequiredOptionsPatchResult
  }

  if (optionsPropertyResult.property.value.type !== "ObjectExpression") {
    return {
      kind: "manual",
      reason: UNSUPPORTED_OPTIONS_REASON,
    } satisfies OxlintRequiredOptionsPatchResult
  }

  return patchOptionsObject(parsed.value, optionsPropertyResult.property.value)
}
