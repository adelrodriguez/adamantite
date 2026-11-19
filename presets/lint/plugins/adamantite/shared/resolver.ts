import { realpathSync } from "node:fs"
import { type NapiResolveOptions, ResolverFactory } from "oxc-resolver"

// TypeScript's `resolution-mode` names these modes. Each selects the `import` or the `require`
// condition of a package's `exports` and `imports`.
export type ResolutionMode = "import" | "require"

const DEFAULT_CONDITIONS = {
  import: ["types", "import", "node", "default"],
  require: ["types", "require", "node", "default"],
} as const satisfies Record<ResolutionMode, readonly string[]>

// TypeScript substitutes the source and declaration extensions for a runtime extension, such as
// `./view.tsx` for `./view.jsx`, and resolves `tsconfig.json` `paths` from the nearest config.
// oxc-resolver does not read `customConditions`. `symlinks: false` keeps a path through
// `node_modules` in its package.
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

const identities = new Map<string, string>()

// Oxlint caches the loaded plugin, so an editor language server needs a restart after a link
// changes.
export function identifyPath(path: string): string {
  if (path.split("/").includes("node_modules")) {
    return path
  }

  let identity = identities.get(path)

  if (identity === undefined) {
    identity = realpathSync(path).replaceAll("\\", "/")
    identities.set(path, identity)
  }

  return identity
}

const baseResolver = new ResolverFactory({
  ...resolverOptions,
  conditionNames: [...DEFAULT_CONDITIONS.import],
})

// Clones share the cache of the base resolver.
const resolvers = new Map<string, ResolverFactory>()

function getResolver(mode: ResolutionMode, conditions: readonly string[]) {
  if (mode === "import" && conditions.length === 0) {
    return baseResolver
  }

  const key = [mode, ...conditions].join("\0")
  let resolver = resolvers.get(key)

  if (resolver === undefined) {
    resolver = baseResolver.cloneWithOptions({
      ...resolverOptions,
      conditionNames: [...conditions, ...DEFAULT_CONDITIONS[mode]],
    })
    resolvers.set(key, resolver)
  }

  return resolver
}

// Oxlint caches the loaded plugin, so an editor language server needs a restart after a
// `package.json` or a `tsconfig.json` changes.
export function resolveImport(
  importer: string,
  specifier: string,
  mode: ResolutionMode,
  conditions: readonly string[] = []
): string | undefined {
  const { path } = getResolver(mode, conditions).resolveFileSync(importer, specifier)

  return path === undefined ? undefined : path.replaceAll("\\", "/")
}
