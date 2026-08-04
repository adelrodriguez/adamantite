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

    if (state.active?.format !== "json" && state.active?.format !== "jsonc") {
      return
    }

    const legacyConfigPath = state.active.path

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

    const otherLegacyConfigPath = state.legacy[0]?.path ?? null

    if (otherLegacyConfigPath && otherLegacyConfigPath !== legacyConfigPath) {
      yield* fs
        .remove(otherLegacyConfigPath)
        .pipe(
          Effect.mapError((cause) => new FailedToDeleteFile({ cause, path: otherLegacyConfigPath }))
        )
    }
  })
}

export default defineMigration({
  check: (context) =>
    Effect.gen(function* () {
      const state = yield* knip.exists(context.cwd)
      const warnings: string[] = []
      if (state.active?.format === "ts" && state.legacy.length > 0) {
        warnings.push(
          "Found both `knip.config.ts` and `knip.json(c)`. Adamantite will use `knip.config.ts`."
        )
      }
      if (state.active && state.active.format !== "ts" && state.legacy.length > 0) {
        warnings.push(
          "Found both `knip.json` and `knip.jsonc`. Multiple legacy knip configs exist; Adamantite will treat `knip.jsonc` as the source of truth when migration is needed."
        )
      }

      if (state.active?.format === "json" || state.active?.format === "jsonc") {
        return {
          applicable: true,
          summary: getLegacyKnipSummary(state.active.format),
          warnings,
        }
      }

      if (state.active?.format === "ts") {
        return { applicable: true, warnings }
      }

      return { applicable: false, warnings }
    }),
  files: [knip.config, ...getLegacyConfigPaths()],
  id: "legacy-knip-json",
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const state = yield* knip.exists(context.cwd)
      const legacyConfigFile = state.active?.path.endsWith(knip.files[2].path)
        ? knip.files[2].path
        : knip.files[1].path

      yield* prompter.withSpinner(() => migrateLegacyKnipConfig(context.cwd), {
        failure: `Failed to migrate ${legacyConfigFile}.`,
        start: `Migrating \`${legacyConfigFile}\` to \`${knip.config}\`...`,
        success: `Knip config migrated to \`${knip.config}\` successfully.`,
      })
    }),
  tags: ["update"],
  title: "Legacy Knip JSON config",
  validate: (context) =>
    Effect.gen(function* () {
      const state = yield* knip.exists(context.cwd)

      if (state.active?.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-knip-json",
          reason: `\`${knip.config}\` is not the active Knip config.`,
        })
      }
    }),
})
