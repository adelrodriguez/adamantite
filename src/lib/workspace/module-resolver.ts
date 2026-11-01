import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { ResolverFactory } from "oxc-resolver"

export class ModuleResolver extends Context.Service<
  ModuleResolver,
  {
    /**
     * Forget the files and package manifests that earlier resolutions read. Call it before each
     * traversal, because a coding agent can change the project between two assessments in one
     * command.
     */
    readonly clearCache: Effect.Effect<void>
    /**
     * The file that Node.js loads for `specifier` when `from` imports it, as Oxlint imports a
     * config. None when the specifier does not resolve, such as a workspace package before an
     * install.
     */
    readonly resolve: (from: string, specifier: string) => Effect.Effect<Option.Option<string>>
  }
>()("ModuleResolver") {
  static readonly layer = Layer.sync(this, () => {
    // Node.js conditions and no `tsconfig.json` `paths`, because Oxlint loads configs through
    // Node.js. The requested file comes first, as Node.js loads it, and a TypeScript source can
    // import a sibling with the `.js` extension of its build output.
    const resolver = new ResolverFactory({
      conditionNames: ["node", "import", "default"],
      extensionAlias: {
        ".cjs": [".cjs", ".cts"],
        ".js": [".js", ".ts"],
        ".mjs": [".mjs", ".mts"],
      },
      extensions: [".ts", ".mts", ".cts", ".js", ".mjs", ".cjs"],
    })

    return {
      clearCache: Effect.sync(() => {
        resolver.clearCache()
      }),
      resolve: (from, specifier) =>
        Effect.sync(() => Option.fromUndefinedOr(resolver.resolveFileSync(from, specifier).path)),
    }
  })
}

/**
 * The folder of the package `name` that Node.js finds from the package at `from`, or none when it
 * is not installed.
 */
export const resolvePackageDirectory = Effect.fn("resolvePackageDirectory")(function* (
  from: string,
  name: string
) {
  const path = yield* Path.Path
  const resolver = yield* ModuleResolver
  const manifest = yield* resolver.resolve(path.join(from, "package.json"), `${name}/package.json`)

  return pipe(
    manifest,
    Option.map((file) => path.dirname(file))
  )
})
