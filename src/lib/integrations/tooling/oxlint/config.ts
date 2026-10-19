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
import type { Finding } from "#lib/integrations/base.ts"
import type { RequiredConfigInspection } from "#lib/integrations/tooling/base.ts"

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

/**
 * Every lint preset a target project can select besides core. Each one is published as
 * `adamantite/lint/<preset>`.
 */
export const LINT_PRESETS = [
  "react",
  "react-strict",
  "react-doctor",
  "tanstack",
  "nextjs",
  "vue",
  "effect",
  "jest",
  "vitest",
  "node",
  "strict",
  "antislop",
  "shadcn",
] as const

export type LintPreset = (typeof LINT_PRESETS)[number]

/**
 * The lint presets for test files. Their rules report code that is not a test, such as top-level
 * calls in a script, so `init` adds them in an `overrides` entry for test files, not in `extends`.
 */
const TEST_PRESETS = ["jest", "vitest"] as const satisfies readonly LintPreset[]

function checkIsTestPreset(preset: string) {
  return TEST_PRESETS.some((testPreset) => testPreset === preset)
}

function getImportName(preset: string) {
  return preset.replaceAll(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

/**
 * The local name of a test preset's `testFiles`. Each test preset exports `testFiles`, so a config
 * with two test presets gives each import its own name.
 */
function getTestFilesName(preset: string, testPresetCount: number) {
  return testPresetCount > 1 ? `${getImportName(preset)}TestFiles` : "testFiles"
}

function getImportClause(preset: string, testPresetCount: number) {
  if (!checkIsTestPreset(preset)) {
    return getImportName(preset)
  }

  const testFilesName = getTestFilesName(preset, testPresetCount)
  const specifier = testFilesName === "testFiles" ? testFilesName : `testFiles as ${testFilesName}`
  return `${getImportName(preset)}, { ${specifier} }`
}

/**
 * The `oxlint.config.ts` that `init` writes. It always extends `custom()`, which is an empty config
 * until the project adds a rule to `.adamantite/rules`. An override cannot use `extends`, so the
 * override for each test preset spreads the preset over the preset's `testFiles`.
 */
export function toOxlintTsConfigContent(presets: string[] = []) {
  const presetNames = presets.includes("core") ? presets : ["core", ...presets]
  const extendedPresets = presetNames.filter((preset) => !checkIsTestPreset(preset))
  const testPresets = presetNames.filter((preset) => checkIsTestPreset(preset))
  return [
    'import { defineConfig } from "oxlint"',
    ...presetNames.map(
      (preset) =>
        `import ${getImportClause(preset, testPresets.length)} from "${preset === "core" ? "adamantite/lint" : `adamantite/lint/${preset}`}"`
    ),
    'import custom from "adamantite/lint/custom"',
    "",
    "export default defineConfig({",
    `  extends: [${[...extendedPresets.map((preset) => getImportName(preset)), "custom()"].join(", ")}],`,
    "  ignorePatterns: core.ignorePatterns,",
    "  options: {",
    ...REQUIRED_BOOLEAN_OPTIONS.map((option) => `    ${option}: true,`),
    "  },",
    ...(testPresets.length === 0
      ? []
      : [
          "  overrides: [",
          ...testPresets.flatMap((preset) => [
            "    {",
            `      files: ${getTestFilesName(preset, testPresets.length)},`,
            `      plugins: ${getImportName(preset)}.plugins,`,
            `      rules: ${getImportName(preset)}.rules,`,
            "    },",
          ]),
          "  ],",
        ]),
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
 * The module that exports `custom()`. It loads the project's custom rules and is not a preset.
 */
const CUSTOM_RULES_MODULE = `${LINT_PRESET_PREFIX}custom`

/**
 * The Adamantite lint presets that an `oxlint.config.ts` imports, such as `react` for
 * `adamantite/lint/react`. The core preset and `custom()` are not listed. An unparsable config
 * imports none.
 */
export function getImportedLintPresets(content: string): string[] {
  return pipe(
    parse(content),
    Option.map((ast) =>
      ast.body.flatMap((statement) =>
        statement.type === "ImportDeclaration"
        && statement.source.value.startsWith(LINT_PRESET_PREFIX)
        && statement.source.value !== CUSTOM_RULES_MODULE
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

function getDefaultImportNames(ast: Program, moduleName: string) {
  return ast.body.flatMap((statement) =>
    statement.type === "ImportDeclaration" && statement.source.value === moduleName
      ? statement.specifiers.flatMap((specifier) =>
          specifier.type === "ImportDefaultSpecifier" ? [specifier.local.name] : []
        )
      : []
  )
}

/**
 * The identifiers in the `extends` array of the exported config. A config without an `extends`
 * array literal lists none.
 */
function getExtendedIdentifiers(config: ObjectExpression) {
  const extendsProperty = getNamedObjectProperty(config, "extends")

  if (
    extendsProperty.status !== "found"
    || extendsProperty.property.value.type !== "ArrayExpression"
  ) {
    return []
  }

  return extendsProperty.property.value.elements.flatMap((element) =>
    element?.type === "Identifier" ? [element.name] : []
  )
}

/**
 * Report the test presets that the global `extends` lists, under their import names. A config that
 * Adamantite cannot inspect gets no finding.
 */
export function getTestPresetFindings(content: string): Finding[] {
  const parsed = parse(content)

  if (Option.isNone(parsed)) {
    return []
  }

  const extended = pipe(
    getExportedConfigObject(parsed.value),
    Option.map((config) => getExtendedIdentifiers(config)),
    Option.getOrElse((): string[] => [])
  )
  const testPresets = TEST_PRESETS.flatMap((preset) =>
    getDefaultImportNames(parsed.value, `${LINT_PRESET_PREFIX}${preset}`)
      .filter((name) => extended.includes(name))
      .map((importName) => ({ importName, preset }))
  )
  const [example] = testPresets

  if (example === undefined) {
    return []
  }

  const isPlural = testPresets.length > 1
  const presetList = `${testPresets.map(({ preset }) => `\`${preset}\``).join(" and ")} ${isPlural ? "presets" : "preset"}`

  return [
    {
      currentState: `\`oxlint.config.ts\` lists the ${presetList} in the global \`extends\`. ${isPlural ? "Their" : "Its"} test rules also report files that are not tests.`,
      goal: [
        `Remove the ${presetList} from \`extends\`. Keep the other presets and \`custom()\` in \`extends\`.`,
        `Add an \`overrides\` entry that spreads ${isPlural ? "each" : "the"} preset over its test files, such as \`{ files: testFiles, plugins: ${example.importName}.plugins, rules: ${example.importName}.rules }\` with \`testFiles\` imported from \`${LINT_PRESET_PREFIX}${example.preset}\`.`,
      ],
      id: "unscoped-oxlint-test-preset",
      integration: "oxlint",
      notes: [
        "`testFiles` lists the files that the test runner runs as tests by default. If the project configures its test runner to find tests in other files, set `files` to those patterns.",
      ],
      reference: {
        content: toOxlintTsConfigContent(getImportedLintPresets(content)),
        language: "ts",
      },
      title: "Unscoped oxlint test preset",
    },
  ]
}
