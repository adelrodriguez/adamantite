import type { OxlintConfig } from "oxlint"

// Opinions for React feature code: state comes from loaders, URL params, and queries; side effects
// live in loaders, actions, and event handlers; and the React Compiler memoizes. Use it together
// with the react preset. The strict preset holds the opinions that do not depend on React.
// React Doctor also checks state and effect misuse in hook modules. Its managed package stays
// in the target project. Init installs the pinned version, and Doctor and update maintain it.
//
// The source tree holds `plugins/adamantite/index.ts` and the dist tree holds `plugins/adamantite/index.js`, so the plugin
// extension follows the extension of this module. Oxlint loads a TypeScript plugin only in the
// source tree, where Node.js strips the types.
const PLUGIN_EXTENSION = import.meta.url.endsWith(".ts") ? "ts" : "js"

const config: OxlintConfig = {
  jsPlugins: [
    "oxlint-plugin-react-doctor",
    {
      name: "adamantite",
      specifier: new URL(`plugins/adamantite/index.${PLUGIN_EXTENSION}`, import.meta.url).href,
    },
  ],
  rules: {
    // Hooks stay allowed in hook modules: `**/use[A-Z]*.{ts,tsx}`, `**/use-*.{ts,tsx}`, and
    // `**/hooks/**`. A project with another layout sets the rule's `allow` option.
    "adamantite/no-react-state-hooks": "error",

    // State values stay immutable, and updaters stay pure.
    "react-doctor/no-create-store-in-render": "error",
    "react-doctor/no-direct-state-mutation": "error",
    "react-doctor/no-eager-new-in-use-state-initializer": "error",
    "react-doctor/no-impure-state-updater": "error",
    "react-doctor/no-loading-flag-reset-outside-finally": "error",
    "react-doctor/no-mutating-reducer-state": "error",

    // Context and object URLs need a lifetime that survives a render.
    "react-doctor/no-create-context-in-render": "error",
    "react-doctor/no-create-object-url-in-render": "error",

    // Effects synchronize external systems and release the resources they start.
    "react-doctor/debounce-no-cleanup": "error",
    "react-doctor/effect-needs-cleanup": "error",
    "react-doctor/effect-raf-loop-needs-cancel": "error",
    "react-doctor/no-effect-event-handler": "error",
    "react-doctor/no-effect-wrapper-discards-callback-cleanup-return": "error",
    "react-doctor/no-event-trigger-state": "error",
    "react-doctor/no-fetch-in-effect": "error",
    "react-doctor/no-pass-live-state-to-parent": "error",
    "react-doctor/no-set-state-after-await-in-effect": "error",
    "react-doctor/no-stale-timer-ref": "error",
  },
}

export default config
