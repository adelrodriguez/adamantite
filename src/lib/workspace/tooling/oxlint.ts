import type { JsonObject, JsonValue } from "type-fest"
import * as Array from "effect/Array"
import { pipe } from "effect/Function"
import * as Option from "effect/Option"
import * as Predicate from "effect/Predicate"
import { print as printAst } from "esrap"
import ts from "esrap/languages/ts"
import {
  parseSync,
  type ArrayExpression,
  type Comment,
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

  const serializedOptions = JSON.stringify(
    Predicate.isObject(options)
      ? {
          ...options,
          respectEslintDisableDirectives: true,
          typeAware: true,
          typeCheck: true,
        }
      : {
          respectEslintDisableDirectives: true,
          typeAware: true,
          typeCheck: true,
        },
    null,
    2
  )
  const serializedConfigEntries = Object.entries(configWithoutOptions).map(
    ([key, value]): [string, string] => [key, JSON.stringify(value, null, 2)]
  )
  const serializedExtends = `[${allExtends.join(", ")}]`
  const body = [
    ["options", serializedOptions],
    ["ignorePatterns", serializeIgnorePatterns(ignorePatterns)],
    ...serializedConfigEntries,
    ["extends", serializedExtends],
  ]
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

interface ParsedConfig {
  readonly comments: readonly Comment[]
  readonly program: Program
}

function parse(content: string) {
  return parseThrowable(content).pipe(
    Option.flatMap((result) =>
      result.errors.length === 0
        ? Option.some<ParsedConfig>({ comments: result.comments, program: result.program })
        : Option.none<ParsedConfig>()
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

  const configObjectExpression = getExportedConfigObject(parsed.value.program)

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
      updatedContent: print(parsed.value.program),
    } satisfies OxlintRequiredOptionsPatchResult
  }

  if (optionsPropertyResult.property.value.type !== "ObjectExpression") {
    return {
      kind: "manual",
      reason: UNSUPPORTED_OPTIONS_REASON,
    } satisfies OxlintRequiredOptionsPatchResult
  }

  return patchOptionsObject(parsed.value.program, optionsPropertyResult.property.value)
}

export type OxlintRuleRemovalResult =
  | { readonly kind: "absent" }
  | { readonly kind: "manual"; readonly reason: string }
  | { readonly kind: "patchable"; readonly updatedContent: string }

const UNSUPPORTED_RULES_REASON =
  '`oxlint.config.ts` references a removed rule in a shape Adamantite cannot patch safely. Make sure every rule entry is a plain `"rule-name": severity` property—avoid spreads (`...rest`) and computed keys (`[name]: ...`).'

interface RuleMatchResult {
  /**
   * Set when a spread or computed key could hide a rule entry the static walk cannot see. A partial
   * patch would still leave oxlint failing to load the config, so any ambiguity downgrades the
   * whole file to a manual fix.
   */
  readonly ambiguous: boolean
  readonly matches: readonly ObjectProperty[]
}

function collectMatchingProperties(
  node: ArrayExpression | ObjectExpression,
  ruleNames: ReadonlySet<string>
): RuleMatchResult {
  let ambiguous = false
  const matches: ObjectProperty[] = []

  const mergeChild = (child: ArrayExpression | ObjectExpression) => {
    const result = collectMatchingProperties(child, ruleNames)

    ambiguous = ambiguous || result.ambiguous
    matches.push(...result.matches)
  }

  if (node.type === "ArrayExpression") {
    for (const element of node.elements) {
      if (element && (element.type === "ArrayExpression" || element.type === "ObjectExpression")) {
        mergeChild(element)
      }
    }

    return { ambiguous, matches }
  }

  for (const property of node.properties) {
    if (property.type === "SpreadElement") {
      const argument = property.argument

      if (argument.type === "ArrayExpression" || argument.type === "ObjectExpression") {
        mergeChild(argument)
      } else {
        ambiguous = true
      }

      continue
    }

    if (property.computed && property.key.type !== "Literal") {
      ambiguous = true
      continue
    }

    if (Option.exists(getStaticPropertyName(property.key), (name) => ruleNames.has(name))) {
      if (property.method || property.kind !== "init") {
        ambiguous = true
        continue
      }

      matches.push(property)
      continue
    }

    if (property.value.type === "ArrayExpression" || property.value.type === "ObjectExpression") {
      mergeChild(property.value)
    }
  }

  return { ambiguous, matches }
}

// Splices a property out of the original source text instead of reprinting the AST, so the
// user's comments and formatting survive the removal.
function removePropertyText(content: string, property: ObjectProperty) {
  let start = property.start
  let end = property.end

  const trailingComma = /^[ \t]*,/.exec(content.slice(end))

  if (trailingComma) {
    end += trailingComma[0].length
  } else {
    const leadingComma = /,[ \t]*$/.exec(content.slice(0, start))

    if (leadingComma) {
      start -= leadingComma[0].length
    }
  }

  // Take the surrounding lines too when nothing else remains on them.
  const lineStart = content.lastIndexOf("\n", start - 1) + 1
  const nextNewline = content.indexOf("\n", end)
  const lineEnd = nextNewline === -1 ? content.length : nextNewline + 1

  if (`${content.slice(lineStart, start)}${content.slice(end, lineEnd)}`.trim() === "") {
    start = lineStart
    end = lineEnd
  }

  return `${content.slice(0, start)}${content.slice(end)}`
}

// Comments arrive in source order, so the right-to-left reduce keeps earlier offsets valid
// while splicing.
function stripComments(content: string, comments: readonly Comment[]) {
  return comments.reduceRight(
    (current, comment) => `${current.slice(0, comment.start)}${current.slice(comment.end)}`,
    content
  )
}

/**
 * Removes rule entries with the given names from anywhere in the exported config object, including
 * nested `overrides` entries, by splicing them out of the original source text so comments and
 * formatting survive. Returns `absent` when the config does not reference any of the rules outside
 * comments, and `manual` when a reference exists that the static walk cannot remove safely.
 */
export function removeOxlintRules(
  content: string,
  ruleNames: readonly string[]
): OxlintRuleRemovalResult {
  if (!ruleNames.some((ruleName) => content.includes(ruleName))) {
    return { kind: "absent" }
  }

  const parsed = parse(content)

  if (Option.isNone(parsed)) {
    return { kind: "manual", reason: UNSUPPORTED_CONFIG_REASON }
  }

  const contentWithoutComments = stripComments(content, parsed.value.comments)

  if (!ruleNames.some((ruleName) => contentWithoutComments.includes(ruleName))) {
    return { kind: "absent" }
  }

  const configObjectExpression = getExportedConfigObject(parsed.value.program)

  if (Option.isNone(configObjectExpression)) {
    return { kind: "manual", reason: UNSUPPORTED_CONFIG_REASON }
  }

  const state = collectMatchingProperties(configObjectExpression.value, new Set(ruleNames))

  if (state.ambiguous || state.matches.length === 0) {
    // Either a spread or computed key could hide an entry, or the name appears outside comments
    // in a position the walk cannot remove; both need a human.
    return { kind: "manual", reason: UNSUPPORTED_RULES_REASON }
  }

  // The walk collects matches in source order, so the right-to-left reduce keeps earlier
  // offsets valid while splicing.
  const updatedContent = state.matches.reduceRight(
    (current, property) => removePropertyText(current, property),
    content
  )

  return { kind: "patchable", updatedContent }
}
