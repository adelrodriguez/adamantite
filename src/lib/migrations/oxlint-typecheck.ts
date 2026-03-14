import type { PackageJson } from "type-fest"
import { parse } from "@babel/parser"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { oxlint } from "#lib/integrations/tooling/oxlint.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { migrateLegacyTypecheckScriptPackageJson } from "#lib/migrations/legacy-typecheck-script.ts"
import { Prompter } from "#lib/services/prompter.ts"
import {
  FailedToReadFile,
  FailedToWriteFile,
  MigrationValidationFailed,
} from "#lib/shared/errors.ts"
import { readPackageJson } from "#lib/workspace/package-json.ts"
import { getManagedScripts } from "#lib/workspace/scripts.ts"

const CONFIG_FILE = "oxlint.config.ts"
const MISSING_OPTIONS_SUMMARY =
  "Updating `oxlint.config.ts` so `options.typeAware` and `options.typeCheck` are enabled for managed lint scripts."
const MANUAL_PATCH_WARNING =
  "Adamantite found an `oxlint.config.ts` that still needs `typeAware` and `typeCheck`, but the file shape is not supported for automatic patching. The migration will stop and ask for a manual fix."
const REQUIRED_BOOLEAN_OPTIONS = ["typeAware", "typeCheck"] as const
const UNSUPPORTED_CONFIG_REASON =
  "`oxlint.config.ts` must export an object literal directly, with or without `defineConfig(...)`, for Adamantite to patch `options` safely."
const UNSUPPORTED_OPTIONS_REASON =
  "`oxlint.config.ts` has an `options` property, but it is not an object literal that Adamantite can patch safely."
const NON_BOOLEAN_OPTIONS_REASON =
  "`oxlint.config.ts` already defines `typeAware` or `typeCheck`, but not as a boolean literal Adamantite can safely patch."

type RequiredBooleanOption = (typeof REQUIRED_BOOLEAN_OPTIONS)[number]

interface NodeLike {
  readonly end?: number | null
  readonly start?: number | null
  readonly type: string
}

interface ObjectPropertyLike extends NodeLike {
  readonly computed?: boolean
  readonly key: unknown
  readonly type: "ObjectProperty"
  readonly value: unknown
}

interface ObjectMethodLike extends NodeLike {
  readonly computed?: boolean
  readonly key: unknown
  readonly type: "ObjectMethod"
}

interface ObjectExpressionLike extends NodeLike {
  readonly properties: readonly unknown[]
  readonly type: "ObjectExpression"
}

interface ObjectRange {
  readonly bodyEnd: number
  readonly bodyStart: number
  readonly closeIndent: string
  readonly newline: string
  readonly propertyIndent: string
}

type NamedObjectPropertyResult =
  | { readonly status: "found"; readonly property: ObjectPropertyLike }
  | { readonly status: "manual" }
  | { readonly status: "missing" }

type OxlintTypecheckState =
  | { readonly status: "not_applicable" }
  | {
      readonly configPath: string
      readonly content: string
      readonly status: "applicable"
    }

type PatchResult =
  | { readonly kind: "configured" }
  | { readonly kind: "manual"; readonly reason: string }
  | { readonly kind: "patchable"; readonly updatedContent: string }

function shouldManageTypecheckedOxlint(packageJson: PackageJson) {
  const migratedPackageJson = migrateLegacyTypecheckScriptPackageJson(packageJson).packageJson
  const managedScripts = getManagedScripts(migratedPackageJson)

  return managedScripts.includes("check") || managedScripts.includes("fix")
}

function hasRange<T extends { readonly end?: number | null; readonly start?: number | null }>(
  node: T
): node is T & { readonly end: number; readonly start: number } {
  return typeof node.start === "number" && typeof node.end === "number"
}

function detectNewline(content: string) {
  return content.includes("\r\n") ? "\r\n" : "\n"
}

function detectLineIndentation(content: string, index: number) {
  const lineStart = content.lastIndexOf("\n", index - 1) + 1
  let cursor = lineStart

  while (cursor < index) {
    const character = content[cursor]

    if (character !== " " && character !== "\t") {
      break
    }

    cursor += 1
  }

  return content.slice(lineStart, cursor)
}

function detectPropertyIndent(
  content: string,
  bodyStart: number,
  bodyEnd: number,
  closeIndent: string,
  newline: string
) {
  const body = content.slice(bodyStart, bodyEnd)

  if (!body.includes(newline)) {
    return `${closeIndent}  `
  }

  for (const line of body.split(newline)) {
    if (line.trim().length === 0) {
      continue
    }

    return line.match(/^[ \t]*/)?.[0] ?? `${closeIndent}  `
  }

  return `${closeIndent}  `
}

function getObjectRange(content: string, objectExpression: ObjectExpressionLike) {
  if (!hasRange(objectExpression)) {
    return null
  }

  const closeBraceIndex = objectExpression.end - 1

  if (content[objectExpression.start] !== "{" || content[closeBraceIndex] !== "}") {
    return null
  }

  const newline = detectNewline(content)
  const closeIndent = detectLineIndentation(content, closeBraceIndex)

  return {
    bodyEnd: closeBraceIndex,
    bodyStart: objectExpression.start + 1,
    closeIndent,
    newline,
    propertyIndent: detectPropertyIndent(
      content,
      objectExpression.start + 1,
      closeBraceIndex,
      closeIndent,
      newline
    ),
  }
}

function prependEntries(
  existingBody: string,
  entries: readonly string[],
  objectRange: ObjectRange
) {
  if (entries.length === 0) {
    return existingBody
  }

  const bodyWithoutLeadingNewline = existingBody.startsWith(objectRange.newline)
    ? existingBody.slice(objectRange.newline.length)
    : existingBody.trim()

  if (bodyWithoutLeadingNewline.trim().length === 0) {
    return `${objectRange.newline}${entries.join(objectRange.newline)}${objectRange.newline}${objectRange.closeIndent}`
  }

  if (existingBody.startsWith(objectRange.newline)) {
    return `${objectRange.newline}${entries.join(objectRange.newline)}${objectRange.newline}${bodyWithoutLeadingNewline}`
  }

  return `${objectRange.newline}${entries.join(objectRange.newline)}${objectRange.newline}${objectRange.propertyIndent}${existingBody.trim()}${objectRange.newline}${objectRange.closeIndent}`
}

function createOptionsBlock(configRange: ObjectRange) {
  const nestedIndent = `${configRange.propertyIndent}  `

  return [
    `${configRange.propertyIndent}options: {`,
    ...REQUIRED_BOOLEAN_OPTIONS.map((option) => `${nestedIndent}${option}: true,`),
    `${configRange.propertyIndent}},`,
  ].join(configRange.newline)
}

function applyReplacements(
  content: string,
  replacements: ReadonlyArray<{
    readonly end: number
    readonly start: number
    readonly text: string
  }>
) {
  let updatedContent = content

  for (const replacement of replacements) {
    updatedContent =
      updatedContent.slice(0, replacement.start) +
      replacement.text +
      updatedContent.slice(replacement.end)
  }

  return updatedContent
}

function insertReplacement(
  replacements: Array<{ end: number; start: number; text: string }>,
  replacement: { end: number; start: number; text: string }
) {
  const insertionIndex = replacements.findIndex(
    (currentReplacement) => replacement.start > currentReplacement.start
  )

  if (insertionIndex === -1) {
    replacements.push(replacement)
    return
  }

  replacements.splice(insertionIndex, 0, replacement)
}

function parseOxlintConfig(content: string) {
  try {
    return parse(content, {
      plugins: ["typescript"],
      sourceType: "module",
    })
  } catch {
    return null
  }
}

function getStaticPropertyName(key: unknown) {
  if (
    typeof key === "object" &&
    key !== null &&
    "type" in key &&
    key.type === "Identifier" &&
    "name" in key &&
    typeof key.name === "string"
  ) {
    return key.name
  }

  if (
    typeof key === "object" &&
    key !== null &&
    "type" in key &&
    key.type === "StringLiteral" &&
    "value" in key &&
    typeof key.value === "string"
  ) {
    return key.value
  }

  return null
}

function getExportedConfigObject(ast: ReturnType<typeof parse>) {
  const exportDefaultDeclarations: Array<{ readonly declaration: unknown }> = []

  for (const statement of ast.program.body) {
    if (
      typeof statement === "object" &&
      "type" in statement &&
      statement.type === "ExportDefaultDeclaration" &&
      "declaration" in statement
    ) {
      exportDefaultDeclarations.push(statement)
    }
  }

  if (exportDefaultDeclarations.length !== 1) {
    return null
  }

  const declaration = exportDefaultDeclarations[0]?.declaration

  if (
    typeof declaration === "object" &&
    declaration !== null &&
    "type" in declaration &&
    declaration.type === "ObjectExpression" &&
    "properties" in declaration &&
    Array.isArray(declaration.properties)
  ) {
    return declaration as ObjectExpressionLike
  }

  if (
    typeof declaration !== "object" ||
    declaration === null ||
    !("type" in declaration) ||
    declaration.type !== "CallExpression" ||
    !("callee" in declaration) ||
    !("arguments" in declaration) ||
    !Array.isArray(declaration.arguments)
  ) {
    return null
  }

  if (
    typeof declaration.callee !== "object" ||
    declaration.callee === null ||
    !("type" in declaration.callee) ||
    declaration.callee.type !== "Identifier" ||
    !("name" in declaration.callee) ||
    declaration.callee.name !== "defineConfig"
  ) {
    return null
  }

  if (declaration.arguments.length !== 1) {
    return null
  }

  const [firstArgument] = declaration.arguments

  if (
    typeof firstArgument === "object" &&
    firstArgument !== null &&
    "type" in firstArgument &&
    firstArgument.type === "ObjectExpression" &&
    "properties" in firstArgument &&
    Array.isArray(firstArgument.properties)
  ) {
    return firstArgument as ObjectExpressionLike
  }

  return null
}

function getNamedObjectProperty(
  objectExpression: ObjectExpressionLike,
  propertyName: string
): NamedObjectPropertyResult {
  let matchedProperty: ObjectPropertyLike | null = null

  for (const property of objectExpression.properties) {
    if (
      typeof property === "object" &&
      property !== null &&
      "type" in property &&
      property.type === "SpreadElement"
    ) {
      return { status: "manual" }
    }

    if (
      typeof property === "object" &&
      property !== null &&
      "type" in property &&
      property.type === "ObjectMethod" &&
      "key" in property
    ) {
      const objectMethod = property as ObjectMethodLike

      if (objectMethod.computed) {
        return { status: "manual" }
      }

      if (getStaticPropertyName(objectMethod.key) === propertyName) {
        return { status: "manual" }
      }

      continue
    }

    if (
      typeof property !== "object" ||
      property === null ||
      !("type" in property) ||
      property.type !== "ObjectProperty" ||
      !("key" in property) ||
      !("value" in property)
    ) {
      return { status: "manual" }
    }

    const objectProperty = property as ObjectPropertyLike

    if (objectProperty.computed) {
      return { status: "manual" }
    }

    if (getStaticPropertyName(objectProperty.key) !== propertyName) {
      continue
    }

    if (matchedProperty) {
      return { status: "manual" }
    }

    matchedProperty = objectProperty
  }

  if (!matchedProperty) {
    return { status: "missing" }
  }

  return {
    property: matchedProperty,
    status: "found",
  }
}

function patchOptionsObject(
  content: string,
  optionsObjectExpression: ObjectExpressionLike
): PatchResult {
  const optionsRange = getObjectRange(content, optionsObjectExpression)

  if (!optionsRange) {
    return {
      kind: "manual",
      reason: UNSUPPORTED_OPTIONS_REASON,
    }
  }

  const optionsBody = content.slice(optionsRange.bodyStart, optionsRange.bodyEnd)
  const missingOptions: RequiredBooleanOption[] = []
  const replacements: Array<{ end: number; start: number; text: string }> = []

  for (const option of REQUIRED_BOOLEAN_OPTIONS) {
    const propertyResult = getNamedObjectProperty(optionsObjectExpression, option)

    if (propertyResult.status === "manual") {
      return {
        kind: "manual",
        reason: NON_BOOLEAN_OPTIONS_REASON,
      }
    }

    if (propertyResult.status === "missing") {
      missingOptions.push(option)
      continue
    }

    const value = propertyResult.property.value

    if (
      typeof value !== "object" ||
      value === null ||
      !("type" in value) ||
      value.type !== "BooleanLiteral" ||
      !("value" in value) ||
      typeof value.value !== "boolean" ||
      !("start" in value) ||
      !("end" in value) ||
      !hasRange(value as NodeLike)
    ) {
      return {
        kind: "manual",
        reason: NON_BOOLEAN_OPTIONS_REASON,
      }
    }

    const booleanLiteral = value as {
      readonly end: number
      readonly start: number
      readonly value: boolean
    }

    if (booleanLiteral.value) {
      continue
    }

    insertReplacement(replacements, {
      end: booleanLiteral.end - optionsRange.bodyStart,
      start: booleanLiteral.start - optionsRange.bodyStart,
      text: "true",
    })
  }

  let updatedOptionsBody = applyReplacements(optionsBody, replacements)

  if (missingOptions.length > 0) {
    updatedOptionsBody = prependEntries(
      updatedOptionsBody,
      missingOptions.map((option) => `${optionsRange.propertyIndent}${option}: true,`),
      optionsRange
    )
  }

  if (updatedOptionsBody === optionsBody) {
    return { kind: "configured" }
  }

  return {
    kind: "patchable",
    updatedContent: `${content.slice(0, optionsRange.bodyStart)}${updatedOptionsBody}${content.slice(optionsRange.bodyEnd)}`,
  }
}

function insertOptionsObject(
  content: string,
  configObjectExpression: ObjectExpressionLike
): PatchResult {
  const configRange = getObjectRange(content, configObjectExpression)

  if (!configRange) {
    return {
      kind: "manual",
      reason: UNSUPPORTED_CONFIG_REASON,
    }
  }

  const updatedBody = prependEntries(
    content.slice(configRange.bodyStart, configRange.bodyEnd),
    [createOptionsBlock(configRange)],
    configRange
  )

  return {
    kind: "patchable",
    updatedContent: `${content.slice(0, configRange.bodyStart)}${updatedBody}${content.slice(configRange.bodyEnd)}`,
  }
}

function inspectAndPatchOxlintTypecheck(content: string): PatchResult {
  const ast = parseOxlintConfig(content)

  if (!ast) {
    return {
      kind: "manual",
      reason: UNSUPPORTED_CONFIG_REASON,
    }
  }

  const configObjectExpression = getExportedConfigObject(ast)

  if (!configObjectExpression) {
    return {
      kind: "manual",
      reason: UNSUPPORTED_CONFIG_REASON,
    }
  }

  const optionsPropertyResult = getNamedObjectProperty(configObjectExpression, "options")

  if (optionsPropertyResult.status === "manual") {
    return {
      kind: "manual",
      reason: UNSUPPORTED_OPTIONS_REASON,
    }
  }

  if (optionsPropertyResult.status === "missing") {
    return insertOptionsObject(content, configObjectExpression)
  }

  if (
    typeof optionsPropertyResult.property.value !== "object" ||
    optionsPropertyResult.property.value === null ||
    !("type" in optionsPropertyResult.property.value) ||
    optionsPropertyResult.property.value.type !== "ObjectExpression" ||
    !("properties" in optionsPropertyResult.property.value) ||
    !Array.isArray(optionsPropertyResult.property.value.properties)
  ) {
    return {
      kind: "manual",
      reason: UNSUPPORTED_OPTIONS_REASON,
    }
  }

  const optionsObjectExpression = optionsPropertyResult.property.value as ObjectExpressionLike

  return patchOptionsObject(content, optionsObjectExpression)
}

function loadOxlintTypecheckState(cwd: string) {
  return Effect.gen(function* () {
    const packageJson = yield* readPackageJson(cwd)

    if (!shouldManageTypecheckedOxlint(packageJson)) {
      return { status: "not_applicable" } satisfies OxlintTypecheckState
    }

    const oxlintState = yield* oxlint.exists(cwd)

    if (oxlintState.format !== "ts") {
      return { status: "not_applicable" } satisfies OxlintTypecheckState
    }

    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configPath = path.join(cwd, CONFIG_FILE)
    const content = yield* fs
      .readFileString(configPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))

    return {
      configPath,
      content,
      status: "applicable",
    } satisfies OxlintTypecheckState
  })
}

export const oxlintTypecheck = defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const state = yield* loadOxlintTypecheckState(context.cwd)

      if (state.status === "not_applicable") {
        return { status: "not_applicable", warnings: [] }
      }

      const patch = inspectAndPatchOxlintTypecheck(state.content)

      if (patch.kind === "configured") {
        return { status: "valid", warnings: [] }
      }

      return {
        status: "needs_migration",
        summary: MISSING_OPTIONS_SUMMARY,
        warnings: patch.kind === "manual" ? [MANUAL_PATCH_WARNING] : [],
      }
    }),
  files: ["oxlint.config.ts"],
  id: "oxlint-typecheck",
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spinner = prompter.spinner()

      spinner.start("Updating `oxlint.config.ts` for type-aware linting...")

      const state = yield* loadOxlintTypecheckState(context.cwd)

      if (state.status === "not_applicable") {
        spinner.stop("No migration needed.")
        return
      }

      const patch = inspectAndPatchOxlintTypecheck(state.content)

      if (patch.kind === "configured") {
        spinner.stop("`oxlint.config.ts` already enables type-aware linting.")
        return
      }

      if (patch.kind === "manual") {
        return yield* new MigrationValidationFailed({
          migrationId: "oxlint-typecheck",
          reason: patch.reason,
        })
      }

      const fs = yield* FileSystem.FileSystem

      yield* fs
        .writeFileString(state.configPath, patch.updatedContent)
        .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: state.configPath })))

      spinner.stop("`oxlint.config.ts` updated for type-aware linting.")
    }),
  tags: ["update"],
  title: "Oxlint type-aware config",
  validate: (context) =>
    Effect.gen(function* () {
      const state = yield* loadOxlintTypecheckState(context.cwd)

      if (state.status === "not_applicable") {
        return
      }

      const patch = inspectAndPatchOxlintTypecheck(state.content)

      if (patch.kind === "configured") {
        return
      }

      return yield* new MigrationValidationFailed({
        migrationId: "oxlint-typecheck",
        reason:
          patch.kind === "patchable"
            ? "`oxlint.config.ts` still needs `options.typeAware` and `options.typeCheck` set to `true`."
            : patch.reason,
      })
    }),
})
