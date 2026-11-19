import type * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import * as Data from "effect/Data"
import type { ModuleResolver } from "#lib/project/module-resolver.ts"
import type {
  EffectOxlintBridgeMissing,
  EffectBuildMissing,
  EffectPlatformUnsupported,
  FailedToParseFile,
  FailedToReadFile,
  InvalidPackageJson,
  PackageNotInstalled,
} from "#lib/shared/errors.ts"

export class BindingOverride extends Data.TaggedClass("Binding")<{
  readonly env: Readonly<Record<string, string>>
  readonly preload: string
}> {}

export class BackendOverride extends Data.TaggedClass("Backend")<{
  readonly env: Readonly<Record<string, string>>
}> {}

export type NativeOverride = BindingOverride | BackendOverride

export class JavaScriptRuntime extends Data.TaggedClass("JavaScript") {}

export class NativeRuntime extends Data.TaggedClass("Native")<{
  readonly resolve: (
    cwd: string,
    oxlint: string
  ) => Effect.Effect<
    readonly NativeOverride[],
    | EffectOxlintBridgeMissing
    | EffectBuildMissing
    | EffectPlatformUnsupported
    | PackageNotInstalled
    | FailedToReadFile
    | FailedToParseFile
    | InvalidPackageJson,
    FileSystem.FileSystem | Path.Path | ModuleResolver
  >
}> {}

export interface OxlintPlugin {
  readonly name: string
  readonly runtime: JavaScriptRuntime | NativeRuntime
}

export function defineOxlintPlugin<const Plugin extends OxlintPlugin>(plugin: Plugin): Plugin {
  return plugin
}
