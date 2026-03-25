import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { CONFIG_FILE, toTsConfigContent } from "#lib/integrations/tooling/knip.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { Prompter } from "#lib/services/prompter.ts"
import {
  FailedToDeleteFile,
  FailedToReadFile,
  FailedToWriteFile,
  InvalidConfigFormat,
  MigrationValidationFailed,
} from "#lib/shared/errors.ts"
import { isJsonObject, parseJson } from "#lib/shared/json.ts"

const LEGACY_CONFIG_FILE_JSON = "knip.json"
const LEGACY_CONFIG_FILE_JSONC = "knip.jsonc"

const DUAL_KNIP_CONFIG_WARNING =
  "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`."

const DUAL_LEGACY_KNIP_JSON_FILES_WARNING =
  "Found both `knip.json` and `knip.jsonc`. Adamantite migrates from `knip.jsonc` and removes the other file."

function getLegacyKnipSummary(format: "json" | "jsonc") {
  const legacyConfigFile = format === "json" ? LEGACY_CONFIG_FILE_JSON : LEGACY_CONFIG_FILE_JSONC

  return `Migrating legacy \`${legacyConfigFile}\` configuration to \`${CONFIG_FILE}\`.`
}

function inspect(cwd: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const tsPath = path.join(cwd, CONFIG_FILE)
    const jsonPath = path.join(cwd, LEGACY_CONFIG_FILE_JSON)
    const jsoncPath = path.join(cwd, LEGACY_CONFIG_FILE_JSONC)
    const hasTs = yield* fs.exists(tsPath)
    const hasJson = yield* fs.exists(jsonPath)
    const hasJsonc = yield* fs.exists(jsoncPath)

    const format: "json" | "jsonc" | "ts" | null = hasTs
      ? "ts"
      : hasJsonc
        ? "jsonc"
        : hasJson
          ? "json"
          : null

    const hasBoth = hasTs && (hasJson || hasJsonc)
    const hasBothLegacyJsonFiles = !hasTs && hasJson && hasJsonc

    const warnings = [
      ...(hasBoth ? [DUAL_KNIP_CONFIG_WARNING] : []),
      ...(hasBothLegacyJsonFiles ? [DUAL_LEGACY_KNIP_JSON_FILES_WARNING] : []),
    ]

    return {
      format,
      hasBoth,
      hasBothLegacyJsonFiles,
      jsonPath: hasJson ? jsonPath : null,
      jsoncPath: hasJsonc ? jsoncPath : null,
      path:
        format === "ts"
          ? tsPath
          : format === "jsonc"
            ? jsoncPath
            : format === "json"
              ? jsonPath
              : null,
      tsPath: hasTs ? tsPath : null,
      warnings,
    }
  })
}

function migrate(cwd: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const state = yield* inspect(cwd)

    if (state.format !== "json" && state.format !== "jsonc") {
      return
    }

    const legacyConfigPath = state.path

    if (!legacyConfigPath) {
      return
    }

    const configPath = path.join(cwd, CONFIG_FILE)
    const legacyConfigContent = yield* fs
      .readFileString(legacyConfigPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: legacyConfigPath })))

    const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

    if (!isJsonObject(existingConfig)) {
      return yield* new InvalidConfigFormat({ path: legacyConfigPath })
    }

    const { $schema: _schema, ...configWithoutSchema } = existingConfig

    yield* fs
      .writeFileString(configPath, toTsConfigContent(configWithoutSchema))
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))

    yield* fs
      .remove(legacyConfigPath)
      .pipe(Effect.mapError((cause) => new FailedToDeleteFile({ cause, path: legacyConfigPath })))

    if (state.hasBothLegacyJsonFiles) {
      const otherLegacyConfigPath = state.format === "jsonc" ? state.jsonPath : state.jsoncPath

      if (otherLegacyConfigPath && otherLegacyConfigPath !== legacyConfigPath) {
        yield* fs
          .remove(otherLegacyConfigPath)
          .pipe(
            Effect.mapError(
              (cause) => new FailedToDeleteFile({ cause, path: otherLegacyConfigPath })
            )
          )
      }
    }
  })
}

export const legacyKnipJson = defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const state = yield* inspect(context.cwd)
      const warnings = state.warnings

      if (state.format === "json" || state.format === "jsonc") {
        return {
          status: "needs_migration",
          summary: getLegacyKnipSummary(state.format),
          warnings,
        }
      }

      if (state.format === "ts") {
        return { status: "valid", warnings }
      }

      return { status: "not_applicable", warnings }
    }),
  files: [CONFIG_FILE, LEGACY_CONFIG_FILE_JSON, LEGACY_CONFIG_FILE_JSONC],
  id: "legacy-knip-json",
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spinner = prompter.spinner()
      const state = yield* inspect(context.cwd)
      const legacyConfigFile =
        state.format === "jsonc" ? LEGACY_CONFIG_FILE_JSONC : LEGACY_CONFIG_FILE_JSON

      spinner.start(`Migrating \`${legacyConfigFile}\` to \`${CONFIG_FILE}\`...`)
      yield* migrate(context.cwd)
      spinner.stop(`Knip config migrated to \`${CONFIG_FILE}\` successfully.`)
    }),
  tags: ["update"],
  title: "Legacy Knip JSON config",
  validate: (context) =>
    Effect.gen(function* () {
      const state = yield* inspect(context.cwd)

      if (state.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-knip-json",
          reason: `\`${CONFIG_FILE}\` is not the active Knip config.`,
        })
      }
    }),
})

export { inspect as inspectLegacyKnipConfig, migrate as migrateLegacyKnipConfig }
