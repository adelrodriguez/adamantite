import type * as PlatformError from "effect/PlatformError"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import type { DependencyInstaller } from "#lib/services/dependency-installer.ts"
import type { Prompter } from "#lib/services/prompter.ts"
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
} from "#lib/shared/errors.ts"

export type MigrationTag = "update" | (string & {})

export interface MigrationContext {
  readonly cwd: string
}

export interface MigrationCheckResult {
  readonly status: "not_applicable" | "valid" | "needs_migration"
  readonly summary?: string
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
  | PlatformError.PlatformError

export type MigrationRequirements =
  | DependencyInstaller
  | FileSystem.FileSystem
  | Path.Path
  | Prompter

export interface Migration {
  readonly id: string
  readonly tags: readonly MigrationTag[]
  readonly title: string
  readonly files?: readonly string[]
  check(
    context: MigrationContext
  ): Effect.Effect<MigrationCheckResult, MigrationError, MigrationRequirements>
  migrate(context: MigrationContext): Effect.Effect<void, MigrationError, MigrationRequirements>
  validate?(context: MigrationContext): Effect.Effect<void, MigrationError, MigrationRequirements>
}

export function defineMigration<const T extends Migration>(migration: T): T {
  return migration
}

export function snapshotFiles(cwd: string, relativePaths: readonly string[]) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const snapshot = new Map<string, string | null>()

    for (const relativePath of relativePaths) {
      const fullPath = path.join(cwd, relativePath)
      const exists = yield* fs.exists(fullPath)

      if (exists) {
        const content = yield* fs.readFileString(fullPath)
        snapshot.set(fullPath, content)
      } else {
        snapshot.set(fullPath, null)
      }
    }

    return snapshot
  })
}

export function restoreFiles(snapshot: Map<string, string | null>) {
  return Effect.gen(function* () {
    const fs = yield* FileSystem.FileSystem

    for (const [fullPath, content] of snapshot) {
      if (content === null) {
        const exists = yield* fs.exists(fullPath)

        if (exists) {
          yield* fs.remove(fullPath)
        }
      } else {
        yield* fs.writeFileString(fullPath, content)
      }
    }
  })
}
