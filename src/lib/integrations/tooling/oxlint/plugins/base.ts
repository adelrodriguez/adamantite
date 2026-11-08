import type * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import * as Data from "effect/Data"
import type {
  EffectBuildMissing,
  EffectPlatformUnsupported,
  FailedToParseFile,
  FailedToReadFile,
  PackageNotInstalled,
} from "#lib/shared/errors.ts"
import type { ModuleResolver } from "#lib/workspace/module-resolver.ts"

/**
 * The native binding file that Oxlint loads in place of its own.
 */
export class BindingOverride extends Data.TaggedClass("Binding")<{ readonly path: string }> {}

/**
 * The variables that start the type-aware backend in place of the default backend.
 */
export class BackendOverride extends Data.TaggedClass("Backend")<{
  readonly env: Readonly<Record<string, string>>
}> {}

export type NativeOverride = BindingOverride | BackendOverride

/**
 * A plugin that Oxlint loads through `jsPlugins`.
 */
export class JavaScriptRuntime extends Data.TaggedClass("JavaScript") {}

/**
 * A plugin whose rules exist only in a native build of Oxlint, which replaces parts of the Oxlint
 * runtime.
 */
export class NativeRuntime extends Data.TaggedClass("Native")<{
  /**
   * Returns no overrides when the target project does not install the plugin package.
   */
  readonly resolve: (
    cwd: string,
    oxlint: string
  ) => Effect.Effect<
    readonly NativeOverride[],
    | EffectBuildMissing
    | EffectPlatformUnsupported
    | PackageNotInstalled
    | FailedToReadFile
    | FailedToParseFile,
    FileSystem.FileSystem | Path.Path | ModuleResolver
  >
}> {}

export interface OxlintPlugin {
  readonly name: string
  readonly runtime: JavaScriptRuntime | NativeRuntime
}

/**
 * Keep package names and capabilities precise without importing version macros.
 */
export function defineOxlintPlugin<const Plugin extends OxlintPlugin>(plugin: Plugin): Plugin {
  return plugin
}
