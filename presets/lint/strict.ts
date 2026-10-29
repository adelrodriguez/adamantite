import type { OxlintConfig } from "oxlint"

// Framework-neutral opinions: values keep their source object visible, types come from
// validation or narrowing instead of assertions, each suppression gives its reason, no debug
// console call stays, and no task comment marks a workaround. Use it with any other preset.
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
    // Nested patterns past two levels and patterns that take more than five properties from one
    // object hide where values come from. Set `maxDepth` and `maxProperties` to change the limits.
    "adamantite/no-overzealous-destructuring": "error",
    // A suppression states why the rule does not apply, after ` -- `, so a reviewer can judge it.
    "adamantite/require-suppression-reason": "error",
    // A console call is debug output that stays in the code. `console.info` stays allowed for
    // intended output.
    "no-console": ["error", { allow: ["info"] }],
    // A TODO, FIXME, XXX, or HACK comment marks a workaround, and agents copy the workaround with
    // the comment. Fix the code now, or track the work in the issue tracker.
    "no-warning-comments": ["error", { terms: ["todo", "fixme", "xxx", "hack"] }],
    // Validate or narrow a value instead of asserting its type. `as const` stays allowed.
    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
  },
}

export default config
