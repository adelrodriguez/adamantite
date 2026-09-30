import type { Plugin, Rule } from "@oxlint/plugins"
import noReactStateHooks from "./rules/no-react-state-hooks.ts"

interface AdamantitePlugin extends Plugin {
  readonly rules: {
    readonly "no-react-state-hooks": Rule
  }
}

/**
 * Adamantite's first-party Oxlint plugin. Presets load it by file URL, so target projects install
 * nothing extra.
 */
const plugin: AdamantitePlugin = {
  meta: { name: "adamantite" },
  rules: {
    "no-react-state-hooks": noReactStateHooks,
  },
}

export default plugin
