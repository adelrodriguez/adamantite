import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import oxfmt from "#lib/integrations/tooling/oxfmt.ts"
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
import { toOxfmtTsConfigContent } from "#lib/workspace/oxfmt-config.ts"

function getLegacyConfigPaths() {
  return [oxfmt.files[1].path, oxfmt.files[2].path] as const
}

function getLegacyOxfmtSummary(format: "json" | "jsonc") {
  const legacyConfigPaths = getLegacyConfigPaths()
  const legacyConfigFile = format === "json" ? legacyConfigPaths[0] : legacyConfigPaths[1]

  return `Migrating legacy \`${legacyConfigFile}\` configuration to \`${oxfmt.config}\`.`
}

function migrateLegacyOxfmtConfig(cwd: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const state = yield* oxfmt.exists(cwd)

    if (state.active?.format !== "json" && state.active?.format !== "jsonc") {
      return
    }

    const legacyConfigPath = state.active.path

    const configPath = path.join(cwd, oxfmt.config)
    const legacyConfigContent = yield* fs
      .readFileString(legacyConfigPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: legacyConfigPath })))

    const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

    if (!isJsonObject(existingConfig)) {
      return yield* new InvalidConfigFormat({ path: legacyConfigPath })
    }

    const { $schema: _schema, ...configWithoutSchema } = existingConfig

    yield* fs
      .writeFileString(configPath, toOxfmtTsConfigContent(configWithoutSchema))
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
      const state = yield* oxfmt.exists(context.cwd)
      const warnings: string[] = []
      if (state.active?.format === "ts" && state.legacy.length > 0) {
        warnings.push(
          "Found both `oxfmt.config.ts` and `.oxfmtrc.json(c)`. Adamantite will use `oxfmt.config.ts`."
        )
      }
      if (state.active && state.active.format !== "ts" && state.legacy.length > 0) {
        warnings.push(
          "Found both `.oxfmtrc.json` and `.oxfmtrc.jsonc`. Multiple legacy oxfmt configs exist; Adamantite will treat `.oxfmtrc.jsonc` as the source of truth when migration is needed."
        )
      }

      if (state.active?.format === "json" || state.active?.format === "jsonc") {
        return {
          applicable: true,
          summary: getLegacyOxfmtSummary(state.active.format),
          warnings,
        }
      }

      if (state.active?.format === "ts") {
        return { applicable: true, warnings }
      }

      return { applicable: false, warnings }
    }),
  files: [oxfmt.config, ...getLegacyConfigPaths()],
  id: "legacy-oxfmt-json",
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      const spinner = prompter.spinner()
      const state = yield* oxfmt.exists(context.cwd)
      const legacyConfigFile = state.active?.path.endsWith(oxfmt.files[2].path)
        ? oxfmt.files[2].path
        : oxfmt.files[1].path

      spinner.start(`Migrating \`${legacyConfigFile}\` to \`${oxfmt.config}\`...`)
      yield* migrateLegacyOxfmtConfig(context.cwd)
      spinner.stop(`Oxfmt config migrated to \`${oxfmt.config}\` successfully.`)
    }),
  tags: ["update"],
  title: "Legacy oxfmt JSON config",
  validate: (context) =>
    Effect.gen(function* () {
      const state = yield* oxfmt.exists(context.cwd)

      if (state.active?.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-oxfmt-json",
          reason: `\`${oxfmt.config}\` is not the active oxfmt config.`,
        })
      }
    }),
})
