import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Order from "effect/Order"
import * as Path from "effect/Path"
import { ModuleResolver } from "#lib/project/module-resolver.ts"
import { readPackageJson } from "#lib/project/package-json.ts"
import { publicImport } from "#lib/shared/package-exports.ts"

const RELEASE = /^(\d+)\.(\d+)\.(\d+)(-)?/u

export const releaseOrder = Order.Tuple([Order.Number, Order.Number, Order.Number, Order.Boolean])

export function parseRelease(version: string) {
  const match = RELEASE.exec(version)

  if (match === null) {
    return Option.none()
  }

  const [, major, minor, patch, prerelease] = match
  const isRelease = prerelease === undefined

  return Option.some([Number(major), Number(minor), Number(patch), isRelease] as const)
}

export const findInstalledPackage = Effect.fn("findInstalledPackage")(function* (root: string) {
  const path = yield* Path.Path
  const resolver = yield* ModuleResolver
  const entry = yield* resolver.resolve(root, publicImport("./lint"))

  if (Option.isNone(entry)) {
    return Option.none<{ readonly directory: string; readonly version: string }>()
  }

  for (
    let directory = path.dirname(entry.value);
    directory !== path.dirname(directory);
    directory = path.dirname(directory)
  ) {
    const manifest = yield* readPackageJson(directory).pipe(Effect.option)

    if (Option.isSome(manifest) && manifest.value.name === "adamantite") {
      return Option.map(Option.fromUndefinedOr(manifest.value.version), (version) => ({
        directory,
        version,
      }))
    }
  }

  return Option.none<{ readonly directory: string; readonly version: string }>()
})

export const readInstalledVersion = (root: string) =>
  Effect.map(
    findInstalledPackage(root),
    Option.map(({ version }) => version)
  )
