import type { Plugin, Rule } from "@oxlint/plugins"
import importOwners from "./rules/import-owners.ts"
import layers from "./rules/layers.ts"
import noAvoidedTerms from "./rules/no-avoided-terms.ts"
import noOverzealousDestructuring from "./rules/no-overzealous-destructuring.ts"
import noQueryDataInState from "./rules/no-query-data-in-state.ts"
import noReactStateHooks from "./rules/no-react-state-hooks.ts"
import queryFromLoader from "./rules/query-from-loader.ts"
import requireSuppressionReason from "./rules/require-suppression-reason.ts"

interface AdamantitePlugin extends Plugin {
  readonly rules: {
    readonly "import-owners": Rule
    readonly layers: Rule
    readonly "no-avoided-terms": Rule
    readonly "no-overzealous-destructuring": Rule
    readonly "no-query-data-in-state": Rule
    readonly "no-react-state-hooks": Rule
    readonly "query-from-loader": Rule
    readonly "require-suppression-reason": Rule
  }
}

/**
 * Adamantite's first-party Oxlint plugin. Presets load it by file URL, so target projects install
 * nothing extra.
 */
const plugin: AdamantitePlugin = {
  meta: { name: "adamantite" },
  rules: {
    "import-owners": importOwners,
    layers,
    "no-avoided-terms": noAvoidedTerms,
    "no-overzealous-destructuring": noOverzealousDestructuring,
    "no-query-data-in-state": noQueryDataInState,
    "no-react-state-hooks": noReactStateHooks,
    "query-from-loader": queryFromLoader,
    "require-suppression-reason": requireSuppressionReason,
  },
}

export default plugin
