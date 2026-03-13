import type * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type * as PlatformError from "effect/PlatformError"
import type {
  FailedToDeleteFile,
  FailedToMergeConfig,
  FailedToParseFile,
  FailedToReadFile,
  FailedToWriteFile,
  FileNotFound,
  InvalidConfigFormat,
} from "#lib/shared/errors.ts"

export type ToolingError =
  | FailedToDeleteFile
  | FailedToMergeConfig
  | FailedToParseFile
  | FailedToReadFile
  | FailedToWriteFile
  | FileNotFound
  | InvalidConfigFormat
  | PlatformError.PlatformError

export type ToolingRequirements = FileSystem.FileSystem | Path.Path

type ToolingEffect = Effect.Effect<unknown, ToolingError, ToolingRequirements>

export interface ToolingPackage {
  readonly name: string
  readonly version: string
}

export interface Tooling extends ToolingPackage {
  readonly config?: unknown
  readonly create?: (...args: readonly never[]) => ToolingEffect
  readonly exists?: (...args: readonly never[]) => ToolingEffect
  readonly update?: (...args: readonly never[]) => ToolingEffect
}

export function defineTooling<const T extends Tooling>(tooling: T): T {
  return tooling
}
