import type { OxlintConfig } from "oxlint"
import { PRESET, type PresetIdentity } from "../identity.ts"
import { firstPartyPlugin } from "./plugins/entry.ts"

const config: OxlintConfig = {
  [PRESET]: { module: "adamantite/lint/tanstack" } satisfies PresetIdentity,
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
