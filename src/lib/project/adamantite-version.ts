import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

export const readInstalledVersion = Effect.fn("readInstalledVersion")(function* (root: string) {
  const path = yield* Path.Path
  const resolver = yield* ModuleResolver
  const entry = yield* resolver.resolve(root, publicImport("./lint"))

  if (Option.isNone(entry)) {
    return Option.none<string>()
  }

  for (
    let directory = path.dirname(entry.value);
    directory !== path.dirname(directory);
    directory = path.dirname(directory)
  ) {
    const manifest = yield* readPackageJson(directory).pipe(Effect.option)

    if (Option.isSome(manifest) && manifest.value.name === "adamantite") {
      return Option.fromUndefinedOr(manifest.value.version)
    }
  }

  return Option.none<string>()
})
