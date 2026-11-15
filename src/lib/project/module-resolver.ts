import * as Array from "effect/Array"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Path from "effect/Path"
import { ResolverFactory } from "oxc-resolver"

// A JavaScript or TypeScript file, declaration files included, which a config lookup skips.
const SOURCE_FILE = /\.[cm]?[jt]sx?$/u

export class ModuleResolver extends Context.Service<
  ModuleResolver,
  {
    /**
     * Forget the files and package manifests that earlier resolutions read. Custom rule discovery
     * calls it before each traversal, because a coding agent can change the project between two
     * assessments in one command, and `addRootDevDependencies` calls it after each install. The
     * cache serves `resolveConfig` too.
     */
    readonly clearCache: Effect.Effect<void>
    /**
     * The file that Node.js loads for `specifier` when a file in `directory` imports it, as Oxlint
     * imports a config. None when the specifier does not resolve, such as a workspace package
     * before an install. The resolver resolves from `directory` itself, so a caller that has the
     * importing file passes its folder.
     */
    readonly resolve: (directory: string, specifier: string) => Effect.Effect<Option.Option<string>>
    /**
     * The config file that TypeScript extends for the package `specifier` in a config in
     * `directory`. None when the specifier does not resolve. TypeScript resolves a relative or
     * absolute `extends` entry by its own path rules, so a caller resolves those itself.
     */
    readonly resolveConfig: (
      directory: string,
      specifier: string
    ) => Effect.Effect<Option.Option<string>>
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

    // TypeScript's config lookup for a package `extends` entry, which shares the cache: the
    // conditions of a CommonJS import, the `tsconfig` field of `package.json`, the `.json`
    // extension, and `tsconfig.json` as the file of a folder. TypeScript skips an export target
    // that is not JSON, such as a `types` declaration file, and tries the next condition, while the
    // resolver returns the first target whose condition matches. So the lookup retries with fewer
    // conditions until it reaches a file that is not JavaScript or TypeScript. The resolver
    // returns the real path, so a JSON export can be a symlink to a `.jsonc` file.
    const configs = [
      ["require", "types", "node", "default"],
      ["require", "node", "default"],
      ["node", "default"],
      ["default"],
    ].map((conditionNames) =>
      resolver.cloneWithOptions({
        conditionNames,
        extensions: [".json"],
        mainFields: ["tsconfig"],
        mainFiles: ["tsconfig"],
      })
    )

    return {
      clearCache: Effect.sync(() => {
        resolver.clearCache()
      }),
      resolve: (directory, specifier) =>
        Effect.sync(() => Option.fromUndefinedOr(resolver.sync(directory, specifier).path)),
      resolveConfig: (directory, specifier) =>
        Effect.sync(() =>
          Array.findFirst(configs, (config) =>
            Option.filter(
              Option.fromUndefinedOr(config.sync(directory, specifier).path),
              (file) => !SOURCE_FILE.test(file)
            )
          )
        ),
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
  const manifest = yield* resolver.resolve(from, `${name}/package.json`)

  return pipe(
    manifest,
    Option.map((file) => path.dirname(file))
  )
})
