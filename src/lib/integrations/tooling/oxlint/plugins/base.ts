import type * as Effect from "effect/Effect"
import type * as FileSystem from "effect/FileSystem"
import type * as Path from "effect/Path"
import type {
  EffectBuildMissing,
  EffectPlatformUnsupported,
  FailedToParseFile,
  FailedToReadFile,
  PackageNotInstalled,
} from "#lib/shared/errors.ts"
import type { ModuleResolver } from "#lib/workspace/module-resolver.ts"

export type NativeOverride =
  | { readonly _tag: "Binding"; readonly path: string }
  | { readonly _tag: "Backend"; readonly env: Readonly<Record<string, string>> }

export interface OxlintPlugin {
  readonly name: string
  readonly runtime:
    | { readonly _tag: "JavaScript" }
    | {
        readonly _tag: "Native"
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
      }
}

/**
 * Keep package names and capabilities precise without importing version macros.
 */
export function defineOxlintPlugin<const Plugin extends OxlintPlugin>(plugin: Plugin): Plugin {
  return plugin
}
