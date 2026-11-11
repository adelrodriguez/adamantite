---
"adamantite": minor
---

Add type resets to `adamantite/typescript`, and add `adamantite/tsconfig` for libraries

`adamantite/typescript` now loads type resets that ship in the package. `JSON.parse()`, `response.json()`, and property reads on `localStorage` return `unknown` instead of `any`, `includes()` on a literal array accepts a wider value, and `.filter(Boolean)` removes falsy types. The resets started from [ts-reset](https://github.com/total-typescript/ts-reset) 0.7.0, which npm does not have yet. They also cover APIs that ts-reset leaves as `any`: `Object.values()` and `Object.entries()` on a type without an index signature, `Object.assign()` with more than three sources, `Object.getPrototypeOf()`, `Reflect.apply()`, `Reflect.construct()`, and the values of a `JSON.parse()` reviver. `adamantite/tsconfig` has the same strict options without the resets.

`init` asks "Use an Adamantite TypeScript preset?" and then which preset to use. `--typescript` now takes a value: `--typescript typescript` or `--typescript tsconfig`. Doctor reports a package that extends `adamantite/typescript`, is not private, and declares `exports` or `types`, because its declaration files can name reset helper types that consumers do not have.

To migrate:

1. Fix the new type errors. Most are values from `JSON.parse()` or `response.json()` that the code used as a specific type. Parse them with a schema, or narrow them.
2. In a library that publishes declaration files, replace `adamantite/typescript` with `adamantite/tsconfig` in `extends`.
3. If the project already set up ts-reset, delete its `reset.d.ts` files, their `include` entries, and the `@total-typescript/ts-reset` dependency.
4. Replace `--typescript` with `--typescript typescript` in scripts that run `adamantite init`.

To keep the strict options without the resets, extend `adamantite/tsconfig`. To turn the resets off in one project that extends `adamantite/typescript`, set `"files": []`. A `files` list in your `tsconfig.json` replaces the preset's list, so list your files in `include`.
