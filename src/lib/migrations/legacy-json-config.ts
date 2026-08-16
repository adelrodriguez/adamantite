import type * as FileSystem from "effect/FileSystem"
import type * as PlatformError from "effect/PlatformError"
import type { JsonObject } from "type-fest"
import * as Effect from "effect/Effect"
import * as Path from "effect/Path"
import type { ToolingConfigState } from "#lib/workspace/tooling/config.ts"
import { defineMigration } from "#lib/migrations/base.ts"
import { InvalidConfigFormat, MigrationValidationFailed } from "#lib/shared/errors.ts"
import { readFile, removeFile, writeFile } from "#lib/shared/filesystem.ts"
import { checkIsJsonObject, parseJson } from "#lib/shared/json.ts"

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
  readonly serialize: (config: JsonObject) => string
  readonly title: string
}

function migrateLegacyJsonConfig(cwd: string, options: LegacyJsonConfigMigrationOptions) {
  return Effect.gen(function* () {
    const path = yield* Path.Path
    const state = yield* options.integration.detect(cwd)

    if (state.active === null || state.active.format === "ts") {
      return yield* Effect.die(
        new Error(`check() guaranteed a legacy ${options.displayName} config exists`)
      )
    }

    const legacyConfigPath = state.active.path
    const configPath = path.join(cwd, options.integration.config)
    const legacyConfigContent = yield* readFile(legacyConfigPath)
    const existingConfig = yield* parseJson(legacyConfigContent, legacyConfigPath)

    if (!checkIsJsonObject(existingConfig)) {
      return yield* new InvalidConfigFormat({ path: legacyConfigPath })
    }

    const { $schema: _schema, ...configWithoutSchema } = existingConfig

    yield* writeFile(configPath, options.serialize(configWithoutSchema))

    for (const legacyConfig of [state.active, ...state.legacy]) {
      yield* removeFile(legacyConfig.path)
    }

    return { warnings: [] }
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

        if (state.active === null || state.active.format === "ts") {
          return { status: "not-applicable", warnings: state.warnings } as const
        }

        return {
          status: "needed",
          summary: `Migrating legacy \`${state.active.file}\` configuration to \`${options.integration.config}\`.`,
          warnings: state.warnings,
        } as const
      }),
    files: options.integration.files.map((file) => file.path),
    id: options.id,
    migrate: (context) => migrateLegacyJsonConfig(context.cwd, options),
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
