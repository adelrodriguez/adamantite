import type { OxlintConfig } from "oxlint"
import { firstPartyPlugin } from "./plugins/entry.ts"

// Framework-neutral opinions: values keep their source object visible, types come from
// validation or narrowing instead of assertions, each suppression gives its reason, no debug
// console call stays, and no task comment marks a workaround. Use it with any other preset.
//
// The anti-slop plugin holds most of the type rules: no `unknown` in signatures, no Reflect-based
// access, no module mocking, and readable spacing. Its rules started as a copy of
// https://github.com/dmmulroy/anti-slop and now live in plugins/anti-slop/ as first-party code. They
// keep the `anti-slop` namespace, so project settings and suppressions keep working.

const config: OxlintConfig = {
  jsPlugins: [firstPartyPlugin("adamantite"), firstPartyPlugin("anti-slop")],
  overrides: [
    {
      // Tests build partial fixtures and doubles, where an assertion is often the clearest option.
      // Outside tests, `consistent-type-assertions` already reports each assertion once. In tests,
      // each assertion states its reason, and no chain or widening hides the source type.
      files: ["**/*.{test,spec}.{ts,tsx,mts,cts}", "**/__tests__/**"],
      rules: {
        "anti-slop/no-chained-type-assertions": "error",
        "anti-slop/no-widen-then-assert": "error",
        "anti-slop/require-safety-comment-for-type-assertion": "error",
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
    "anti-slop/no-array-filter-map": "error",
    "anti-slop/no-conditional-empty-object-spread": "error",
    // Decode input at its boundary into types that the code owns, instead of passing `unknown`,
    // loose dictionaries, or `typeof` checks through the code.
    "anti-slop/no-known-value-widening": "error",
    // Tests replace a dependency through its interface instead of mocking its module.
    "anti-slop/no-module-mocking": "error",
    "anti-slop/no-object-parameters": "error",
    "anti-slop/no-reduce-accumulator-copy": "error",
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
    "anti-slop/require-readable-spacing": "error",
    // A console call is debug output that stays in the code. `console.info` stays allowed for
    // intended output.
    "no-console": ["error", { allow: ["info"] }],
    // A TODO, FIXME, XXX, or HACK comment marks a workaround, and agents copy the workaround with
    // the comment. Fix the code now, or track the work in the issue tracker.
    "no-warning-comments": ["error", { terms: ["todo", "fixme", "xxx", "hack"] }],
    // The autofix of this core rule makes `Record` aliases that no-known-value-widening reports
    // again.
    "typescript/consistent-indexed-object-style": "off",
    // Validate or narrow a value instead of asserting its type. `as const` stays allowed.
    "typescript/consistent-type-assertions": ["error", { assertionStyle: "never" }],
    // This core rule bans the empty-accumulator form that no-known-value-widening accepts.
    "unicorn/no-immediate-mutation": "off",
  },
}

export default config
