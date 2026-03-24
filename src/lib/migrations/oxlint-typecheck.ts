import type { PackageJson } from "type-fest"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
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
import { oxlint } from "#lib/integrations/tooling/oxlint.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { migrateLegacyTypecheckScriptPackageJson } from "#lib/migrations/legacy-typecheck-script.ts"
import { Prompter } from "#lib/services/prompter.ts"
import {
  FailedToReadFile,
  FailedToWriteFile,
  MigrationValidationFailed,
} from "#lib/shared/errors.ts"
import { isJsonObject } from "#lib/shared/json.ts"
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
const GENERATED_PATCH_FAILURE_REASON =
  "Adamantite could not generate the required `options.typeAware` and `options.typeCheck` patch."

type RequiredBooleanOption = (typeof REQUIRED_BOOLEAN_OPTIONS)[number]

type NamedObjectPropertyResult =
  | { readonly status: "found"; readonly property: ObjectProperty }
  | { readonly status: "manual" }
  | { readonly status: "missing" }

type PatchResult =
  | { readonly kind: "configured" }
  | { readonly kind: "manual"; readonly reason: string }
  | { readonly kind: "patchable"; readonly updatedContent: string }

function shouldManageTypecheckedOxlint(packageJson: PackageJson) {
  const migratedPackageJson = migrateLegacyTypecheckScriptPackageJson(packageJson).packageJson
  const managedScripts = getManagedScripts(migratedPackageJson)

  return managedScripts.includes("check") || managedScripts.includes("fix")
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
      parseSync(CONFIG_FILE, content, {
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
        } satisfies PatchResult
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
        } satisfies PatchResult
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
        } satisfies PatchResult
      }

      optionsObjectExpression.properties.unshift(...generatedOptionProperties.value)
      changed = true
    }

    if (!changed) {
      return { kind: "configured" } satisfies PatchResult
    }

    return {
      kind: "patchable",
      updatedContent: print(ast),
    } satisfies PatchResult
  })
}

function inspect(content: string) {
  return Effect.gen(function* () {
    const parsed = yield* parse(content)

    if (Option.isNone(parsed)) {
      return {
        kind: "manual",
        reason: UNSUPPORTED_CONFIG_REASON,
      } satisfies PatchResult
    }

    const configObjectExpression = getExportedConfigObject(parsed.value)

    if (Option.isNone(configObjectExpression)) {
      return {
        kind: "manual",
        reason: UNSUPPORTED_CONFIG_REASON,
      } satisfies PatchResult
    }

    const optionsPropertyResult = getNamedObjectProperty(configObjectExpression.value, "options")

    if (optionsPropertyResult.status === "manual") {
      return {
        kind: "manual",
        reason: UNSUPPORTED_OPTIONS_REASON,
      } satisfies PatchResult
    }

    if (optionsPropertyResult.status === "missing") {
      const optionsProperty = yield* createRequiredOptionsProperty()

      if (Option.isNone(optionsProperty)) {
        return {
          kind: "manual",
          reason: GENERATED_PATCH_FAILURE_REASON,
        } satisfies PatchResult
      }

      configObjectExpression.value.properties.unshift(optionsProperty.value)

      return {
        kind: "patchable",
        updatedContent: print(parsed.value),
      } satisfies PatchResult
    }

    if (!isObjectExpression(optionsPropertyResult.property.value)) {
      return {
        kind: "manual",
        reason: UNSUPPORTED_OPTIONS_REASON,
      } satisfies PatchResult
    }

    return yield* patchOptionsObject(parsed.value, optionsPropertyResult.property.value)
  })
}

function evaluate(cwd: string) {
  return Effect.gen(function* () {
    const packageJson = yield* readPackageJson(cwd)

    if (!shouldManageTypecheckedOxlint(packageJson)) {
      return { status: "not_applicable" } as const
    }

    const oxlintState = yield* oxlint.exists(cwd)

    if (oxlintState.format !== "ts") {
      return { status: "not_applicable" } as const
    }

    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const configPath = path.join(cwd, CONFIG_FILE)
    const content = yield* fs
      .readFileString(configPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: configPath })))

    return {
      configPath,
      patch: yield* inspect(content),
      status: "applicable",
    } as const
  })
}

export const oxlintTypecheck = defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const evaluation = yield* evaluate(context.cwd)

      if (evaluation.status === "not_applicable") {
        return { status: "not_applicable", warnings: [] }
      }

      const { patch } = evaluation

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

      const evaluation = yield* evaluate(context.cwd)

      if (evaluation.status === "not_applicable") {
        spinner.stop("No migration needed.")
        return
      }

      const { patch } = evaluation

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
        .writeFileString(evaluation.configPath, patch.updatedContent)
        .pipe(
          Effect.mapError((cause) => new FailedToWriteFile({ cause, path: evaluation.configPath }))
        )

      spinner.stop("`oxlint.config.ts` updated for type-aware linting.")
    }),
  tags: ["update"],
  title: "Oxlint type-aware config",
  validate: (context) =>
    Effect.gen(function* () {
      const evaluation = yield* evaluate(context.cwd)

      if (evaluation.status === "not_applicable") {
        return
      }

      const { patch } = evaluation

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
