import type * as PlatformError from "effect/PlatformError"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import * as Predicate from "effect/Predicate"
import type { ToolingConfigState } from "#lib/workspace/tooling/config.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { Prompter } from "#lib/services/prompter.ts"
import {
  FailedToDeleteFile,
  FailedToReadFile,
  FailedToWriteFile,
  InvalidConfigFormat,
  MigrationValidationFailed,
} from "#lib/shared/errors.ts"
import { parseJson } from "#lib/shared/json.ts"

interface LegacyJsonConfigIntegration {
  readonly config: string
  readonly detect: (
    cwd: string
  ) => Effect.Effect<
    ToolingConfigState,
    PlatformError.PlatformError,
    FileSystem.FileSystem | Path.Path
  >
  readonly files: ReadonlyArray<{ readonly path: string }>
}

export interface LegacyJsonConfigMigrationOptions {
  /**
   * Tool name as it appears in user-facing migration messages, e.g. `Knip`.
   */
  readonly displayName: string
  readonly id: string
  readonly integration: LegacyJsonConfigIntegration
  /**
   * Serialize the parsed legacy JSON config (without `$schema`) into the new TS config file.
   */
  readonly serialize: (config: Record<string, unknown>) => string
  readonly title: string
}

function migrateLegacyJsonConfig(cwd: string, options: LegacyJsonConfigMigrationOptions) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const state = yield* options.integration.detect(cwd)

    if (state.active === null || state.active.format === "ts") {
      return
    }

    const legacyConfigPath = state.active.path
    const configPath = path.join(cwd, options.integration.config)
    const legacyConfigContent = yield* fs
      .readFileString(legacyConfigPath)
      .pipe(Effect.mapError((cause) => new FailedToReadFile({ cause, path: legacyConfigPath })))

    const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

    if (!Predicate.isObject(existingConfig)) {
      return yield* new InvalidConfigFormat({ path: legacyConfigPath })
    }

    const { $schema: _schema, ...configWithoutSchema } = existingConfig

    yield* fs
      .writeFileString(configPath, options.serialize(configWithoutSchema))
      .pipe(Effect.mapError((cause) => new FailedToWriteFile({ cause, path: configPath })))

    for (const legacyConfig of [state.active, ...state.legacy]) {
      yield* fs
        .remove(legacyConfig.path)
        .pipe(
          Effect.mapError((cause) => new FailedToDeleteFile({ cause, path: legacyConfig.path }))
        )
    }
  })
}

/**
 * A migration that rewrites a legacy JSON config into the latest supported TS config and removes
 * every legacy config file (Knip, Oxfmt, Oxlint).
 */
export function defineLegacyJsonConfigMigration(options: LegacyJsonConfigMigrationOptions) {
  return defineMigration({
    check: (context) =>
      Effect.gen(function* () {
        const state = yield* options.integration.detect(context.cwd)

        if (state.active === null) {
          return { status: "not-applicable", warnings: state.warnings } as const
        }

        if (state.active.format === "ts") {
          return { status: "already-migrated", warnings: state.warnings } as const
        }

        return {
          status: "needed",
          summary: `Migrating legacy \`${state.active.file}\` configuration to \`${options.integration.config}\`.`,
          warnings: state.warnings,
        } as const
      }),
    files: options.integration.files.map((file) => file.path),
    id: options.id,
    migrate: (context) =>
      Effect.gen(function* () {
        const prompter = yield* Prompter
        const state = yield* options.integration.detect(context.cwd)
        const legacyConfigFile =
          state.active !== null && state.active.format !== "ts"
            ? state.active.file
            : (options.integration.files[1]?.path ?? options.integration.config)

        yield* prompter.withSpinner(() => migrateLegacyJsonConfig(context.cwd, options), {
          failure: `Failed to migrate ${legacyConfigFile}.`,
          start: `Migrating \`${legacyConfigFile}\` to \`${options.integration.config}\`...`,
          success: `${options.displayName} config migrated to \`${options.integration.config}\` successfully.`,
        })
      }),
    tags: ["update"],
    title: options.title,
    validate: (context) =>
      Effect.gen(function* () {
        const state = yield* options.integration.detect(context.cwd)

        if (state.active?.format !== "ts") {
          return yield* new MigrationValidationFailed({
            migrationId: options.id,
            reason: `\`${options.integration.config}\` is not the active ${options.displayName} config.`,
          })
        }
      }),
  })
}
