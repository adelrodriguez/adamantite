import { join, resolve } from "node:path/posix"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import { ModuleResolver } from "#lib/project/module-resolver.ts"

export function makeModuleResolverLayer(
  root: string,
  resolutions: Readonly<Record<string, string>> = {},
  onClearCache: Effect.Effect<void> = Effect.void
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
  })
}
