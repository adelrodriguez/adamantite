import type { OxlintConfig } from "oxlint"

// Opinions for TanStack Query with route loaders: each query is defined once with `queryOptions()`
// so a loader can preload it, and query data stays in the query cache. The react-doctor preset
// covers other query misuse, such as refetches from effects and mutations without invalidation.
//
// The source tree holds `plugin/index.ts` and the dist tree holds `plugin/index.js`, so the plugin
// extension follows the extension of this module. Oxlint loads a TypeScript plugin only in the
// source tree, where Node.js strips the types.
const PLUGIN_EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js"

const config: OxlintConfig = {
  jsPlugins: [
    {
      name: "adamantite",
      specifier: new URL(`plugin/index.${PLUGIN_EXTENSION}`, import.meta.url).href,
    },
  ],
  rules: {
    // `useState(query.data)` keeps a copy that stops updating when the query refetches.
    "adamantite/no-query-data-in-state": "error",
    // Single-file analysis: the rule cannot prove that a loader preloads the options, so it is a
    // nudge toward shared `queryOptions()` definitions, not a guarantee.
    "adamantite/query-from-loader": "error",
  },
}

export default config
