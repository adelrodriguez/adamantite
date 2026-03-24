import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { CONFIG_FILE, toTsConfigContent } from "#lib/integrations/tooling/oxfmt.ts"
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

const LEGACY_CONFIG_FILE_JSON = ".oxfmtrc.json"
const LEGACY_CONFIG_FILE_JSONC = ".oxfmtrc.jsonc"

const DUAL_OXFMT_CONFIG_WARNING =
  "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`."

export const DUAL_LEGACY_OXFMT_JSON_FILES_WARNING =
  "Found both `.oxfmtrc.json` and `.oxfmtrc.jsonc`. Adamantite migrates from `.oxfmtrc.jsonc` and removes the other file."

function getLegacyOxfmtSummary(format: "json" | "jsonc") {
  const legacyConfigFile = format === "json" ? LEGACY_CONFIG_FILE_JSON : LEGACY_CONFIG_FILE_JSONC

  return `Migrating legacy \`${legacyConfigFile}\` configuration to \`${CONFIG_FILE}\`.`
}

export function inspectLegacyOxfmtConfig(cwd: string) {
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

    return {
      format,
      hasBoth: hasTs && (hasJson || hasJsonc),
      hasBothLegacyJsonFiles: hasJson && hasJsonc && !hasTs,
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
    }
  })
}

export function migrateLegacyOxfmtConfig(cwd: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const state = yield* inspectLegacyOxfmtConfig(cwd)

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
      const otherLegacyConfigPath =
        state.format === "jsonc"
          ? path.join(cwd, LEGACY_CONFIG_FILE_JSON)
          : path.join(cwd, LEGACY_CONFIG_FILE_JSONC)

      if (otherLegacyConfigPath !== legacyConfigPath) {
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

export const legacyOxfmtJson = defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const state = yield* inspectLegacyOxfmtConfig(context.cwd)
      const warnings = [
        ...(state.hasBoth ? [DUAL_OXFMT_CONFIG_WARNING] : []),
        ...(state.hasBothLegacyJsonFiles ? [DUAL_LEGACY_OXFMT_JSON_FILES_WARNING] : []),
      ]

      if (state.format === "json" || state.format === "jsonc") {
        return {
          status: "needs_migration",
          summary: getLegacyOxfmtSummary(state.format),
          warnings,
        }
      }

      if (state.format === "ts") {
        return { status: "valid", warnings }
      }

      return { status: "not_applicable", warnings }
    }),
  files: [CONFIG_FILE, LEGACY_CONFIG_FILE_JSON, LEGACY_CONFIG_FILE_JSONC],
  id: "legacy-oxfmt-json",
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spinner = prompter.spinner()
      const state = yield* inspectLegacyOxfmtConfig(context.cwd)
      const legacyConfigFile =
        state.format === "jsonc" ? LEGACY_CONFIG_FILE_JSONC : LEGACY_CONFIG_FILE_JSON

      spinner.start(`Migrating \`${legacyConfigFile}\` to \`${CONFIG_FILE}\`...`)
      yield* migrateLegacyOxfmtConfig(context.cwd)
      spinner.stop(`Oxfmt config migrated to \`${CONFIG_FILE}\` successfully.`)
    }),
  tags: ["update"],
  title: "Legacy oxfmt JSON config",
  validate: (context) =>
    Effect.gen(function* () {
      const state = yield* inspectLegacyOxfmtConfig(context.cwd)

      if (state.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-oxfmt-json",
          reason: `\`${CONFIG_FILE}\` is not the active oxfmt config.`,
        })
      }
    }),
})
