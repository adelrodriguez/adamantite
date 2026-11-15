import { join, resolve } from "node:path/posix"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ModuleResolver } from "#lib/project/module-resolver.ts"

/**
 * A `ModuleResolver` that reads no files. It resolves each specifier in `resolutions` to that path
 * below `root`, and any other relative specifier to its path from the directory. Other specifiers
 * do not resolve, as packages that are not installed. The TypeScript config lookup resolves each
 * specifier in `configs` to that path below `root`, and no other specifier. `onClearCache` runs
 * when a traversal clears the cache.
 */
export function makeModuleResolverLayer(
  root: string,
  resolutions: Readonly<Record<string, string>> = {},
  {
    configs = {},
    onClearCache = Effect.void,
  }: {
    readonly configs?: Readonly<Record<string, string>>
    readonly onClearCache?: Effect.Effect<void>
  } = {}
) {
  return Layer.succeed(ModuleResolver)({
    clearCache: onClearCache,
    resolve: (directory, specifier) => {
      const listed = resolutions[specifier]

      if (listed !== undefined) {
        return Effect.succeedSome(join(root, listed))
      }

      return specifier.startsWith(".")
        ? Effect.succeedSome(resolve(directory, specifier))
        : Effect.succeedNone
    },
    resolveConfig: (_directory, specifier) => {
      const listed = configs[specifier]

      return listed === undefined ? Effect.succeedNone : Effect.succeedSome(join(root, listed))
    },
  })
}
