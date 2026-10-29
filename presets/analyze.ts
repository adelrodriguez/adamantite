import type { KnipConfiguration } from "knip"

interface SuggestedIgnoreDependencies {
  effect: string[]
  monorepo: string[]
}

/**
 * Suggested `ignoreDependencies` lists, grouped by the kind of project that needs them. The default
 * export does not include them, because Knip prints a configuration hint for an ignore that matches
 * nothing.
 *
 * - `monorepo`: `adamantite analyze` runs Sherif in a monorepo, and Knip has no plugin that sees that
 *   reference, so it reports Sherif as an unused devDependency.
 * - `effect`: the `effect` lint preset names the `@effect/language-service` plugin in
 *   `tsconfig.json`. The patched TypeScript from `@effect/tsgo` supplies it, so no package has that
 *   name, and Knip reports it as an unlisted dependency.
 *
 * ```ts
 * import analyze, { ignoreDependencies } from "adamantite/analyze"
 *
 * export default { ...analyze, ignoreDependencies: ignoreDependencies.monorepo }
 * ```
 */
export const ignoreDependencies: SuggestedIgnoreDependencies = {
  effect: ["@effect/language-service"],
  monorepo: ["sherif"],
}

// `custom()` from `adamantite/lint/custom` loads the rule files at lint time, so no module imports
// them. The Oxlint plugin's `entry` adds them as entry files and keeps Knip's default entry files,
// which a top-level `entry` replaces. Knip applies it in each workspace package. Files that start
// with `_` are helpers, so Knip still reports one that no file imports. A rules folder at another
// path (`custom({ dir })`) needs its own patterns.
const config: KnipConfiguration = {
  ignoreExportsUsedInFile: true,
  oxlint: {
    entry: [
      ".adamantite/rules/[!_]*.{js,mjs,mts,ts}",
      ".adamantite/rules/tests/[!_]*.{js,mjs,mts,ts}",
    ],
  },
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
