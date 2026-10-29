import type { OxlintConfig } from "oxlint"

// The anti-slop plugin (https://github.com/dmmulroy/anti-slop) rejects escape hatches such as
// unjustified type assertions, `unknown` in signatures, Reflect-based property access, and module
// mocking. Upstream is not published to npm, so Adamantite ships a bundled build in
// vendor/antislop/. scripts/vendor-plugins.ts regenerates it.
//
// The specifier is an absolute URL from this module's location, so the plugin loads independently
// of how the target project resolves packages. plugin.mjs has the same relative location in the
// source tree and in the dist tree. This module runs under whatever runtime executes oxlint in the
// target project, so it uses only runtime-neutral APIs.
const config: OxlintConfig = {
  jsPlugins: [
    {
      name: "anti-slop",
      specifier: new URL("vendor/antislop/plugin.mjs", import.meta.url).href,
    },
  ],
  rules: {
    "anti-slop/no-chained-type-assertions": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    "anti-slop/no-known-value-widening": "error",
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reflect-apply": "error",
    "anti-slop/no-reflect-get": "error",
    // Type predicates (`(x): x is T`) are the boundary that the rule recommends, and they cannot
    // do the check without `typeof`.
    "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    // These core rules conflict with anti-slop. The consistent-indexed-object-style autofix makes
    // `Record` aliases that no-known-value-widening reports again, and no-immediate-mutation bans
    // the empty-accumulator form that no-known-value-widening accepts.
    "typescript/consistent-indexed-object-style": "off",
    "unicorn/no-immediate-mutation": "off",
  },
}

export default config
