import type { OxlintConfig } from "oxlint"
import { PRESET, type PresetIdentity } from "../identity.ts"
import { testFiles as jestTestFiles } from "./jest.ts"
import { firstPartyPlugin } from "./plugins/entry.ts"
import { testFiles as vitestTestFiles } from "./vitest.ts"

// Framework-neutral opinions: values keep their source object visible, types come from
// validation or narrowing instead of assertions, each suppression gives its reason, no debug
// console call stays, and no task comment marks a workaround. Use it with any other preset.
//
// The quality plugin holds most of the type rules: no `unknown` in signatures, no Reflect-based
// access, and readable spacing. Its rules started as a copy of
// https://github.com/dmmulroy/anti-slop and now live in plugins/quality/ as first-party code. They
// use the `quality` namespace.
//
// The testing plugin holds the rules that keep tests honest: no module mocks, fixed sleeps,
// retries, or raised timeouts. Its rules started as a copy of https://github.com/interfere-inc/landmines and now live
// in plugins/testing/ as first-party code. They use the `testing` namespace.

const config: OxlintConfig = {
  [PRESET]: { module: "adamantite/lint/strict" } satisfies PresetIdentity,
  jsPlugins: [
    firstPartyPlugin("adamantite"),
    firstPartyPlugin("quality"),
    firstPartyPlugin("testing"),
  ],
  overrides: [
    {
      // A declaration file states the types of code that it does not hold, such as a built-in API or
      // a package without types. It cannot change a signature that takes or returns `unknown`,
      // `object`, or a dictionary.
      files: ["**/*.d.{ts,mts,cts}"],
      rules: {
        "quality/no-object-parameters": "off",
        "quality/no-unknown-parameters": "off",
        "quality/no-unknown-returns": "off",
        "quality/no-unsafe-dictionary-type": "off",
      },
    },
    {
      // Tests build partial fixtures and doubles, where an assertion is often the clearest option.
      // Outside tests, `consistent-type-assertions` already reports each assertion once. In tests,
      // each assertion states its reason, and no chain or widening hides the source type. The files
      // are each file that the jest or vitest preset treats as a test, so the presets agree.
      files: [...new Set([...jestTestFiles, ...vitestTestFiles])],
      rules: {
        "quality/no-chained-type-assertions": "error",
        "quality/no-widen-then-assert": "error",
        "quality/require-safety-comment-for-type-assertion": "error",
        // A fixed sleep, a retry, or a raised timeout guesses how long the work takes. The rules
        // ask the test to await the event that it depends on.
        "testing/no-fixed-sleep": "error",
        "testing/no-flake-masking": "error",
        "typescript/consistent-type-assertions": "error",
      },
    },
    {
      // A Vitest config can retry every test in its `test` options, also in a project.
      files: ["**/{vite,vitest}.config.{js,mjs,cjs,ts,mts,cts}"],
      rules: { "testing/no-flake-masking": "error" },
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
    "quality/no-array-filter-map": "error",
    "quality/no-conditional-empty-object-spread": "error",
    // Decode input at its boundary into types that the code owns, instead of passing `unknown`,
    // loose dictionaries, or `typeof` checks through the code.
    "quality/no-known-value-widening": "error",
    "quality/no-object-parameters": "error",
    "quality/no-reduce-accumulator-copy": "error",
    "quality/no-reflect-apply": "error",
    "quality/no-reflect-get": "error",
    // Type predicates (`(x): x is T`) are the boundary that the rule recommends, and they cannot
    // do the check without `typeof`.
    "quality/no-runtime-typeof": ["error", { allowInTypeGuards: true }],
    "quality/no-shape-in-symbol-names": "error",
    "quality/no-unknown-parameters": "error",
    "quality/no-unknown-returns": "error",
    "quality/no-unknown-type-aliases": "error",
    "quality/no-unsafe-dictionary-type": "error",
    "quality/require-readable-spacing": "error",
    // Tests replace a dependency through its interface instead of mocking its module. The rule runs
    // in every file, so a Vitest or Jest setup file cannot mock a module for each test either.
    "testing/no-doubles": "error",
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
