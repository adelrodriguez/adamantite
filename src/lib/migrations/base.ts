import type * as PlatformError from "effect/PlatformError"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type {
  FailedToDeleteFile,
  FailedToMergeConfig,
  FailedToParseFile,
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  InvalidConfigFormat,
  MigrationValidationFailed,
  NoPackageManager,
  UnsupportedConfigState,
} from "#lib/shared/errors.ts"
import type { DependencyInstaller } from "#lib/workspace/dependency-installer.ts"
import type { NodeVersionResolver } from "#lib/workspace/node-version-resolver.ts"

export interface MigrationContext {
  readonly cwd: string
}

export type MigrationCheckResult =
  | {
      readonly status: "needed"
      /**
       * Human-readable description of the pending migration.
       */
      readonly summary: string
      readonly warnings: readonly string[]
    }
  | {
      readonly status: "not-applicable"
      readonly warnings: readonly string[]
    }

export type MigrationError =
  | FailedToDeleteFile
  | FailedToMergeConfig
  | FailedToParseFile
  | FailedToReadFile
  | FailedToWriteFile
  | FileNotFound
  | InvalidConfigFormat
  | MigrationValidationFailed
  | NoPackageManager
  | UnsupportedConfigState
  | PlatformError.PlatformError

export type MigrationRequirements =
  | DependencyInstaller
  | FileSystem.FileSystem
  | NodeVersionResolver
  | Path.Path

export interface MigrationRunResult {
  /**
   * Messages for the command layer to surface; migrations never print themselves.
   */
  readonly warnings: readonly string[]
}

export interface Migration {
  readonly id: string
  readonly tags: readonly ["update"]
  readonly title: string
  readonly files?: readonly string[]
  check(
    context: MigrationContext
  ): Effect.Effect<MigrationCheckResult, MigrationError, MigrationRequirements>
  /**
   * Applies the migration unconditionally: `check` alone decides whether it runs.
   */
  migrate(
    context: MigrationContext
  ): Effect.Effect<MigrationRunResult, MigrationError, MigrationRequirements>
  validate?(context: MigrationContext): Effect.Effect<void, MigrationError, MigrationRequirements>
}

export function defineMigration<const T extends Migration>(migration: T): T {
  return migration
}

export function runMigration(migration: Migration, context: MigrationContext) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const filePaths = migration.files ?? []
    const snapshot = new Map<string, string | null>()

    for (const relativePath of filePaths) {
      const fullPath = path.join(context.cwd, relativePath)
      const exists = yield* fs.exists(fullPath)

      if (exists) {
        const content = yield* fs.readFileString(fullPath)
        snapshot.set(fullPath, content)
      } else {
        snapshot.set(fullPath, null)
      }
    }

    return yield* migration.migrate(context).pipe(
      Effect.tap(() => migration.validate?.(context) ?? Effect.void),
      Effect.onError(() =>
        Effect.gen(function* () {
          for (const [fullPath, content] of snapshot) {
            if (content !== null) {
              yield* fs.writeFileString(fullPath, content).pipe(Effect.ignore)
              continue
            }

            const exists = yield* fs.exists(fullPath).pipe(Effect.orElseSucceed(() => false))

            if (!exists) {
              continue
            }

            yield* fs.remove(fullPath).pipe(Effect.ignore)
          }
        })
      )
    )
  })
}
