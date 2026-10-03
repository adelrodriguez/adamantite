import type { Plugin, Rule } from "@oxlint/plugins"
import noOverzealousDestructuring from "./rules/no-overzealous-destructuring.ts"
import noQueryDataInState from "./rules/no-query-data-in-state.ts"
import noReactStateHooks from "./rules/no-react-state-hooks.ts"
import queryFromLoader from "./rules/query-from-loader.ts"

interface AdamantitePlugin extends Plugin {
  readonly rules: {
    readonly "no-overzealous-destructuring": Rule
    readonly "no-query-data-in-state": Rule
    readonly "no-react-state-hooks": Rule
    readonly "query-from-loader": Rule
  }
}

/**
 * Adamantite's first-party Oxlint plugin. Presets load it by file URL, so target projects install
 * nothing extra.
 */
const plugin: AdamantitePlugin = {
  meta: { name: "adamantite" },
  rules: {
    "no-overzealous-destructuring": noOverzealousDestructuring,
    "no-query-data-in-state": noQueryDataInState,
    "no-react-state-hooks": noReactStateHooks,
    "query-from-loader": queryFromLoader,
  },
}

export default plugin
