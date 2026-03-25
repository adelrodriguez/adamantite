import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import knip from "#lib/integrations/tooling/knip.ts"
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
import { toKnipTsConfigContent } from "#lib/workspace/knip-config.ts"

function getLegacyConfigPaths() {
  return [knip.files[1].path, knip.files[2].path] as const
}

function getLegacyKnipSummary(format: "json" | "jsonc") {
  const legacyConfigPaths = getLegacyConfigPaths()
  const legacyConfigFile = format === "json" ? legacyConfigPaths[0] : legacyConfigPaths[1]

  return `Migrating legacy \`${legacyConfigFile}\` configuration to \`${knip.config}\`.`
}

function migrateLegacyKnipConfig(cwd: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const state = yield* knip.exists(cwd)

    if (state.format !== "json" && state.format !== "jsonc") {
      return
    }

    const legacyConfigPath = state.path

    if (!legacyConfigPath) {
      return
    }

    const configPath = path.join(cwd, knip.config)
    const legacyConfigContent = yield* fs
      .readFileString(legacyConfigPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: legacyConfigPath })))

    const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

    if (!isJsonObject(existingConfig)) {
      return yield* new InvalidConfigFormat({ path: legacyConfigPath })
    }

    const { $schema: _schema, ...configWithoutSchema } = existingConfig

    yield* fs
      .writeFileString(configPath, toKnipTsConfigContent(configWithoutSchema))
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
      const state = yield* knip.exists(context.cwd)
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
  files: [knip.config, ...getLegacyConfigPaths()],
  id: "legacy-knip-json",
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spinner = prompter.spinner()
      const state = yield* knip.exists(context.cwd)
      const legacyConfigPaths = getLegacyConfigPaths()
      const legacyConfigFile =
        state.format === "jsonc" ? legacyConfigPaths[1] : legacyConfigPaths[0]

      spinner.start(`Migrating \`${legacyConfigFile}\` to \`${knip.config}\`...`)
      yield* migrateLegacyKnipConfig(context.cwd)
      spinner.stop(`Knip config migrated to \`${knip.config}\` successfully.`)
    }),
  tags: ["update"],
  title: "Legacy Knip JSON config",
  validate: (context) =>
    Effect.gen(function* () {
      const state = yield* knip.exists(context.cwd)

      if (state.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-knip-json",
          reason: `\`${knip.config}\` is not the active Knip config.`,
        })
      }
    }),
})
