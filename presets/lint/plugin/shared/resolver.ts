import { type NapiResolveOptions, ResolverFactory } from "oxc-resolver"

// The import resolution that the first-party rules share, so `adamantite/layers` and
// `adamantite/import-owners` agree on the file that an import reaches. This module runs under
// whatever runtime executes oxlint in the target project; oxc-resolver ships Node-API bindings for
// Node.js and Bun.

const DEFAULT_CONDITIONS = ["types", "import", "node", "default"]

// TypeScript substitutes the source and declaration extensions for a runtime extension, such as
// `./view.tsx` for `./view.jsx`, and `tsconfig.json` `paths` resolve from the nearest config.
// oxc-resolver does not read `customConditions`, so they come from the `conditions` argument. The
// resolver keeps symlinked paths as they are, so they compare with the paths that Oxlint lints.
const resolverOptions = {
  extensionAlias: {
    ".cjs": [".cts", ".d.cts", ".cjs"],
    ".js": [".ts", ".tsx", ".d.ts", ".js", ".jsx"],
    ".jsx": [".tsx", ".ts", ".d.ts", ".jsx", ".js"],
    ".mjs": [".mts", ".d.mts", ".mjs"],
  },
  extensions: [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".js", ".jsx", ".mjs", ".cjs", ".json"],
  symlinks: false,
  tsconfig: "auto",
} as const satisfies NapiResolveOptions

const baseResolver = new ResolverFactory({ ...resolverOptions, conditionNames: DEFAULT_CONDITIONS })

// One resolver for each set of conditions. Clones share the cache of the base resolver.
const resolvers = new Map<string, ResolverFactory>()

function getResolver(conditions: readonly string[]) {
  if (conditions.length === 0) {
    return baseResolver
  }

  const key = conditions.join("\0")
  let resolver = resolvers.get(key)

  if (resolver === undefined) {
    resolver = baseResolver.cloneWithOptions({
      ...resolverOptions,
      conditionNames: [...conditions, ...DEFAULT_CONDITIONS],
    })
    resolvers.set(key, resolver)
  }

  return resolver
}

/**
 * The file that `specifier` in `importer` resolves to, with `/` between folders, or undefined when
 * it does not resolve. Oxlint caches the loaded plugin, so an editor language server needs a
 * restart after a `package.json` or `tsconfig.json` changes.
 */
export function resolveImport(
  importer: string,
  specifier: string,
  conditions: readonly string[] = []
): string | undefined {
  const { path } = getResolver(conditions).resolveFileSync(importer, specifier)

  return path === undefined ? undefined : path.replaceAll("\\", "/")
}
