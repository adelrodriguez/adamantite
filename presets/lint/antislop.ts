import type { OxlintConfig } from "oxlint"

// The anti-slop plugin (https://github.com/dmmulroy/anti-slop) rejects
// low-evidence, low-signal TypeScript and JavaScript patterns — unjustified
// type assertions, `unknown` leaking through signatures, Reflect-based
// property access, module mocking, and similar escape hatches. Upstream is
// deliberately not published to npm, so Adamantite ships a self-contained
// bundled build in vendor/antislop/plugin.mjs — see vendor/antislop/license.md
// for attribution and scripts/vendor-plugins.ts for how it is regenerated.
//
// The specifier is an absolute path computed from this module's location so
// the bundled plugin loads regardless of how the consuming project resolves
// packages. The plugin.mjs file sits at the same relative location in the
// source tree and in the published dist tree. This module runs under whatever
// runtime executes oxlint in the target project, so it sticks to
// runtime-neutral APIs.
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
    // allowInTypeGuards exempts `typeof` inside type predicate functions
    // ((x): x is T) — predicates are the named-boundary pattern the rule
    // pushes toward, and hand-rolled boundary validation has no other way to
    // write the check.
    "anti-slop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "anti-slop/no-shape-in-symbol-names": "error",
    "anti-slop/no-unknown-parameters": "error",
    "anti-slop/no-unknown-returns": "error",
    "anti-slop/no-unknown-type-aliases": "error",
    "anti-slop/no-unsafe-dictionary-type": "error",
    "anti-slop/no-widen-then-assert": "error",
    "anti-slop/require-safety-comment-for-type-assertion": "error",
    // Core rules that pinch against anti-slop when both are enabled:
    // consistent-indexed-object-style's autofix rewrites index-signature
    // interfaces into `Record` aliases, which no-known-value-widening
    // resolves and re-flags (a fix/break loop), and no-immediate-mutation
    // bans the empty-accumulator escape from the same rule.
    "typescript/consistent-indexed-object-style": "off",
    "unicorn/no-immediate-mutation": "off",
  },
}

export default config
