import { dirname, join, resolve } from "node:path/posix"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ModuleResolver } from "#lib/workspace/module-resolver.ts"

/**
 * A `ModuleResolver` that reads no files. It resolves each specifier in `resolutions` to that path
 * below `root`, and any other relative specifier to its exact path. Other specifiers do not
 * resolve, as packages that are not installed. `onClearCache` runs when a traversal clears the
 * cache.
 */
export function makeModuleResolverLayer(
  root: string,
  resolutions: Readonly<Record<string, string>> = {},
  onClearCache: Effect.Effect<void> = Effect.void
) {
  return Layer.succeed(ModuleResolver)({
    clearCache: onClearCache,
    resolve: (from, specifier) => {
      const listed = resolutions[specifier]

      if (listed !== undefined) {
        return Effect.succeedSome(join(root, listed))
      }

      return specifier.startsWith(".")
        ? Effect.succeedSome(resolve(dirname(from), specifier))
        : Effect.succeedNone
    },
  })
}
