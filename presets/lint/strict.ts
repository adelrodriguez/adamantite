import type { OxlintConfig } from "oxlint"
import { testFiles as jestTestFiles } from "./jest.ts"
import { firstPartyPlugin } from "./plugins/entry.ts"
import { testFiles as vitestTestFiles } from "./vitest.ts"

// Framework-neutral opinions: values keep their source object visible, types come from
// validation or narrowing instead of assertions, each suppression gives its reason, no debug
// console call stays, and no task comment marks a workaround. Use it with any other preset.
//
// The antislop plugin holds most of the type rules: no `unknown` in signatures, no Reflect-based
// access, no module mocking, and readable spacing. Its rules started as a copy of
// https://github.com/dmmulroy/anti-slop and now live in plugins/antislop/ as first-party code. They
// use the `antislop` namespace. Doctor reports old rule names for migration.

const config: OxlintConfig = {
  jsPlugins: [firstPartyPlugin("adamantite"), firstPartyPlugin("antislop")],
  overrides: [
    {
      // A declaration file states the types of code that it does not hold, such as a built-in API or
      // a package without types. It cannot change a signature that takes or returns `unknown`,
      // `object`, or a dictionary.
      files: ["**/*.d.{ts,mts,cts}"],
      rules: {
        "antislop/no-object-parameters": "off",
        "antislop/no-unknown-parameters": "off",
        "antislop/no-unknown-returns": "off",
        "antislop/no-unsafe-dictionary-type": "off",
      },
    },
    {
      // Tests build partial fixtures and doubles, where an assertion is often the clearest option.
      // Outside tests, `consistent-type-assertions` already reports each assertion once. In tests,
      // each assertion states its reason, and no chain or widening hides the source type. The files
      // are each file that the jest or vitest preset treats as a test, so the presets agree.
      files: [...new Set([...jestTestFiles, ...vitestTestFiles])],
      rules: {
        "antislop/no-chained-type-assertions": "error",
        "antislop/no-widen-then-assert": "error",
        "antislop/require-safety-comment-for-type-assertion": "error",
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
    "antislop/no-array-filter-map": "error",
    "antislop/no-conditional-empty-object-spread": "error",
    // Decode input at its boundary into types that the code owns, instead of passing `unknown`,
    // loose dictionaries, or `typeof` checks through the code.
    "antislop/no-known-value-widening": "error",
    // Tests replace a dependency through its interface instead of mocking its module.
    "antislop/no-module-mocking": "error",
    "antislop/no-object-parameters": "error",
    "antislop/no-reduce-accumulator-copy": "error",
    "antislop/no-reflect-apply": "error",
    "antislop/no-reflect-get": "error",
    // Type predicates (`(x): x is T`) are the boundary that the rule recommends, and they cannot
    // do the check without `typeof`.
    "antislop/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "antislop/no-shape-in-symbol-names": "error",
    "antislop/no-unknown-parameters": "error",
    "antislop/no-unknown-returns": "error",
    "antislop/no-unknown-type-aliases": "error",
    "antislop/no-unsafe-dictionary-type": "error",
    "antislop/require-readable-spacing": "error",
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
