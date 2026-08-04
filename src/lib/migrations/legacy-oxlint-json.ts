import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import oxlint from "#lib/integrations/tooling/oxlint.ts"
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
import { getOxlintPresetNames, toOxlintTsConfigContent } from "#lib/workspace/oxlint-config.ts"

function migrateLegacyOxlintConfig(cwd: string) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const state = yield* oxlint.detect(cwd)

    if (state.active?.format !== "json") {
      return
    }

    const legacyConfigPath = state.active.path

    const configPath = path.join(cwd, oxlint.config)
    const legacyConfigContent = yield* fs
      .readFileString(legacyConfigPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: legacyConfigPath })))

    const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

    if (!isJsonObject(existingConfig)) {
      return yield* new InvalidConfigFormat({ path: legacyConfigPath })
    }

    const { $schema: _schema, ...configWithoutSchema } = existingConfig
    const extendsArray = Array.isArray(configWithoutSchema.extends)
      ? configWithoutSchema.extends.filter((value): value is string => typeof value === "string")
      : typeof configWithoutSchema.extends === "string"
        ? [configWithoutSchema.extends]
        : []
    const presetNameSet = new Set(getOxlintPresetNames())
    const passthroughSet = new Set<string>()

    for (const extendsItem of extendsArray) {
      const nodeModulesMatch = extendsItem.match(
        /^(?:\.\/)?node_modules\/adamantite\/presets\/lint\/([a-z0-9-]+)\.(?:json|ts)$/
      )
      const exportMatch = extendsItem.match(/^adamantite\/lint(?:\/([a-z0-9-]+))?$/)
      const presetName = nodeModulesMatch?.[1] ?? (exportMatch ? (exportMatch[1] ?? "core") : null)

      if (presetName) {
        presetNameSet.add(presetName)
      } else {
        passthroughSet.add(extendsItem)
      }
    }

    const { extends: _extends, ...configWithoutExtends } = configWithoutSchema

    yield* fs
      .writeFileString(
        configPath,
        toOxlintTsConfigContent(configWithoutExtends, [...presetNameSet], [...passthroughSet])
      )
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))

    yield* fs
      .remove(legacyConfigPath)
      .pipe(Effect.mapError((cause) => new FailedToDeleteFile({ cause, path: legacyConfigPath })))
  })
}

export default defineMigration({
  id: "legacy-oxlint-json",

  files: [oxlint.config, oxlint.files[1].path],
  tags: ["update"],
  title: "Legacy oxlint JSON config",

  check: (context) =>
    Effect.gen(function* () {
      const oxlintState = yield* oxlint.detect(context.cwd)
      const warnings =
        oxlintState.active?.format === "ts" && oxlintState.legacy.length > 0
          ? [
              `Found both \`${oxlint.config}\` and \`${oxlint.files[1].path}\`. Adamantite will use \`${oxlint.config}\`.`,
            ]
          : []

      if (oxlintState.active?.format === "json") {
        return {
          applicable: true,
          summary: `Migrating legacy \`${oxlint.files[1].path}\` configuration to \`${oxlint.config}\`.`,
          warnings,
        }
      }

      if (oxlintState.active?.format === "ts") {
        return { applicable: true, warnings }
      }

      return { applicable: false, warnings }
    }),
  migrate: (context) =>
    Effect.gen(function* () {
      const prompter = yield* Prompter
      yield* prompter.withSpinner(() => migrateLegacyOxlintConfig(context.cwd), {
        failure: `Failed to migrate ${oxlint.files[1].path}.`,
        start: `Migrating \`${oxlint.files[1].path}\` to \`${oxlint.config}\`...`,
        success: `Oxlint config migrated to \`${oxlint.config}\` successfully.`,
      })
    }),
  validate: (context) =>
    Effect.gen(function* () {
      const oxlintState = yield* oxlint.detect(context.cwd)

      if (oxlintState.active?.format !== "ts") {
        return yield* new MigrationValidationFailed({
          migrationId: "legacy-oxlint-json",
          reason: `\`${oxlint.config}\` is not the active oxlint config.`,
        })
      }
    }),
})
