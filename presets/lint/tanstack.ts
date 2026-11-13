import type { OxlintConfig } from "oxlint"
import { firstPartyPlugin } from "./plugins/entry.ts"

// Opinions for TanStack Query with route loaders: each query is defined once with `queryOptions()`
// so a loader can preload it, and query data stays in the query cache.

const config: OxlintConfig = {
  jsPlugins: [firstPartyPlugin("adamantite")],
  rules: {
    // `useState(query.data)` keeps a copy that stops updating when the query refetches.
    "adamantite/no-query-data-in-state": "error",
    // Single-file analysis: the rule cannot prove that a loader preloads the options, so it is a
    // nudge toward shared `queryOptions()` definitions, not a guarantee.
    "adamantite/query-from-loader": "error",
  },
}

export default config
