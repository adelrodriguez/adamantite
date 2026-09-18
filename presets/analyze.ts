import type { KnipConfiguration } from "knip"

interface SuggestedIgnoreDependencies {
  monorepo: string[]
}

/**
 * Suggested `ignoreDependencies` lists, grouped by the kind of project that needs them. The default
 * export does not include them, because Knip prints a configuration hint for an ignore that matches
 * nothing.
 *
 * - `monorepo`: `adamantite analyze` runs Sherif in a monorepo, and Knip has no plugin that sees that
 *   reference, so it reports Sherif as an unused devDependency.
 *
 * ```ts
 * import analyze, { ignoreDependencies } from "adamantite/analyze"
 *
 * export default { ...analyze, ignoreDependencies: ignoreDependencies.monorepo }
 * ```
 */
export const ignoreDependencies: SuggestedIgnoreDependencies = {
  monorepo: ["sherif"],
}

const config: KnipConfiguration = {
  ignoreExportsUsedInFile: true,
  rules: {
    binaries: "error",
    catalog: "error",
    dependencies: "error",
    devDependencies: "error",
    duplicates: "warn",
    enumMembers: "off",
    exports: "warn",
    files: "error",
    namespaceMembers: "warn",
    nsExports: "warn",
    nsTypes: "warn",
    optionalPeerDependencies: "warn",
    types: "warn",
    unlisted: "error",
    unresolved: "error",
  },
}

export default config
