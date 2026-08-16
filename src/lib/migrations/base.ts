import type * as FileSystem from "effect/FileSystem"
import type * as PlatformError from "effect/PlatformError"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
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
import { readFileIfExists, removeFile, writeFile } from "#lib/shared/filesystem.ts"

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

export const runMigration = Effect.fn("runMigration")(function* (
  migration: Migration,
  context: MigrationContext
) {
  const path = yield* Path.Path
  const filePaths = migration.files ?? []
  const snapshot = yield* Effect.forEach(
    filePaths,
    (relativePath) => {
      const fullPath = path.join(context.cwd, relativePath)
      return readFileIfExists(fullPath).pipe(Effect.map((content) => [fullPath, content] as const))
    },
    { concurrency: "unbounded" }
  )

  return yield* migration.migrate(context).pipe(
    Effect.tap(() => migration.validate?.(context) ?? Effect.void),
    // Restore sequentially and absorb restore failures: the migration error must stay visible.
    Effect.onError(() =>
      Effect.forEach(([fullPath, content]: readonly [string, Option.Option<string>]) =>
        Option.match(content, {
          onNone: () => removeFile(fullPath).pipe(Effect.ignore),
          onSome: (value) => writeFile(fullPath, value).pipe(Effect.ignore),
        })
      )(snapshot)
    )
  )
})
