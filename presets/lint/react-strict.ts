import type { OxlintConfig } from "oxlint"

// Opinions for React feature code: state comes from loaders, URL params, and queries; side effects
// live in loaders, actions, and event handlers; and the React Compiler memoizes. Use it together
// with the react preset.
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
  overrides: [
    {
      // Tests build partial fixtures and doubles, where an assertion is often the clearest option.
      files: ["**/*.{test,spec}.{ts,tsx,mts,cts}", "**/__tests__/**"],
      rules: {
        "typescript/consistent-type-assertions": "error",
      },
    },
  ],
  rules: {
    // Hooks stay allowed in hook modules: `**/use[A-Z]*.{ts,tsx}`, `**/use-*.{ts,tsx}`, and
    // `**/hooks/**`. A project with another layout sets the rule's `allow` option.
    "adamantite/no-react-state-hooks": "error",
    // Validate or narrow a value instead of asserting its type. `as const` stays allowed.
    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
  },
}

export default config
