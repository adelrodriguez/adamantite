import type { KnipConfiguration } from "knip"
import type { PresetIdentity } from "./identity.ts"

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

const config: KnipConfiguration = {
  [Symbol.for("adamantite.preset")]: { module: "adamantite/analyze" } satisfies PresetIdentity,
  ignoreExportsUsedInFile: true,
  // `custom()` loads the rule files at lint time, so no module imports them. The `entry` of Knip's
  // Oxlint plugin adds them and keeps Knip's default entry files, which a top-level `entry`
  // replaces. Knip applies it in each workspace package. A file that starts with `_` is a helper, so
  // Knip still reports one that no file imports. A rules folder at another path, from
  // `custom({ dir })`, needs its own pattern.
  oxlint: {
    entry: [".adamantite/lint/[!_]*.{js,mjs,mts,ts}"],
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
