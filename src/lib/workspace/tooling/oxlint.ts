import * as Array from "effect/Array"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import {
  parseSync,
  type ExportDefaultDeclaration,
  type ObjectExpression,
  type ObjectProperty,
  type Program,
  type PropertyKey,
} from "oxc-parser"
import type { RequiredConfigInspection } from "#lib/workspace/tooling/config.ts"

const REQUIRED_BOOLEAN_OPTIONS = [
  "respectEslintDisableDirectives",
  "typeAware",
  "typeCheck",
] as const
const UNSUPPORTED_CONFIG_REASON =
  "`oxlint.config.ts` must export an object literal directly, with or without `defineConfig(...)`, for Adamantite to inspect `options`."
const UNSUPPORTED_OPTIONS_REASON =
  "`oxlint.config.ts` has an `options` property, but it is not an object literal that Adamantite can inspect."
const NON_BOOLEAN_OPTIONS_REASON =
  "`oxlint.config.ts` has an `options` object Adamantite cannot inspect. Make sure each required option is a plain `key: true | false` property. Avoid spreads (`...rest`), computed keys (`[name]: ...`), duplicate keys, methods/getters/setters, and non-boolean-literal values."

type NamedObjectPropertyResult =
  | { readonly status: "found"; readonly property: ObjectProperty }
  | { readonly status: "invalid" }
  | { readonly status: "missing" }

function getImportName(preset: string) {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

export function toOxlintTsConfigContent(presets: string[] = []) {
  const presetNames = presets.includes("core") ? presets : ["core", ...presets]
  return [
    'import { defineConfig } from "oxlint"',
    ...presetNames.map(
      (preset) =>
        `import ${getImportName(preset)} from "${preset === "core" ? "adamantite/lint" : `adamantite/lint/${preset}`}"`
    ),
    "",
    "export default defineConfig({",
    `  extends: [${presetNames.map((preset) => getImportName(preset)).join(", ")}],`,
    "  ignorePatterns: core.ignorePatterns,",
    "  options: {",
    ...REQUIRED_BOOLEAN_OPTIONS.map((option) => `    ${option}: true,`),
    "  },",
    "})",
    "",
  ].join("\n")
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

const LINT_PRESET_PREFIX = "adamantite/lint/"

/**
 * The Adamantite lint presets that an `oxlint.config.ts` imports, such as `react` for
 * `adamantite/lint/react`. The core preset is not listed. An unparsable config imports none.
 */
export function getImportedLintPresets(content: string): string[] {
  return pipe(
    parse(content),
    Option.map((ast) =>
      ast.body.flatMap((statement) =>
        statement.type === "ImportDeclaration"
        && statement.source.value.startsWith(LINT_PRESET_PREFIX)
          ? [statement.source.value.slice(LINT_PRESET_PREFIX.length)]
          : []
      )
    ),
    Option.getOrElse((): string[] => [])
  )
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
    declaration.type !== "CallExpression"
    || declaration.callee.type !== "Identifier"
    || declaration.callee.name !== "defineConfig"
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
      return { status: "invalid" }
    }

    if (property.computed) {
      return { status: "invalid" }
    }

    const nameMatches = Option.contains(getStaticPropertyName(property.key), propertyName)

    if (property.method || property.kind !== "init") {
      if (nameMatches) {
        return { status: "invalid" }
      }

      continue
    }

    if (!nameMatches) {
      continue
    }

    if (matchedProperty) {
      return { status: "invalid" }
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

function inspectOptionsObject(options: ObjectExpression): RequiredConfigInspection {
  for (const option of REQUIRED_BOOLEAN_OPTIONS) {
    const property = getNamedObjectProperty(options, option)
    if (property.status === "invalid") {
      return { kind: "invalid", reason: NON_BOOLEAN_OPTIONS_REASON }
    }
    if (
      property.status === "missing"
      || property.property.value.type !== "Literal"
      || property.property.value.value !== true
    ) {
      return {
        kind: "invalid",
        reason: "The required Oxlint options are missing or are not set to true.",
      }
    }
  }
  return { kind: "configured" }
}

export function inspectRequiredOxlintConfig(content: string): RequiredConfigInspection {
  const parsed = parse(content)

  if (Option.isNone(parsed)) {
    return {
      kind: "invalid",
      reason: UNSUPPORTED_CONFIG_REASON,
    }
  }

  const configObjectExpression = getExportedConfigObject(parsed.value)

  if (Option.isNone(configObjectExpression)) {
    return {
      kind: "invalid",
      reason: UNSUPPORTED_CONFIG_REASON,
    }
  }

  const optionsPropertyResult = getNamedObjectProperty(configObjectExpression.value, "options")

  if (optionsPropertyResult.status === "invalid") {
    return {
      kind: "invalid",
      reason: UNSUPPORTED_OPTIONS_REASON,
    }
  }

  if (optionsPropertyResult.status === "missing") {
    return { kind: "invalid", reason: "The required Oxlint options are missing." }
  }

  if (optionsPropertyResult.property.value.type !== "ObjectExpression") {
    return {
      kind: "invalid",
      reason: UNSUPPORTED_OPTIONS_REASON,
    }
  }

  return inspectOptionsObject(optionsPropertyResult.property.value)
}
