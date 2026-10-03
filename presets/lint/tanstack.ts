import type { OxlintConfig } from "oxlint"

// Opinions for TanStack Query with route loaders: each query is defined once with `queryOptions()`
// so a loader can preload it, and query data stays in the query cache. The react-doctor preset
// covers other query misuse, such as refetches from effects and mutations without invalidation.
//
// The rules come from Adamantite's first-party plugin in plugin/, so target projects install
// nothing extra. The specifier is an absolute file URL computed from this module's location, as in
// the antislop preset. The source tree holds `plugin/index.ts` and the published dist tree holds
// `plugin/index.js`, so the extension follows this module's own. Oxlint loads a TypeScript plugin
// only in the source tree, where Node.js strips the types.
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
