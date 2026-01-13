---
"adamantite": minor
---

Add new rules from oxlint v1.39.0 and oxfmt v0.24.0:

**Core preset (`typescript/`):**

- `typescript/prefer-optional-chain` - Prefer using optional chain expressions instead of logical AND chains

**Vitest preset:**

- `vitest/consistent-each-for` - Enforce consistent usage of `each` for test cases
- `vitest/hoisted-apis-on-top` - Ensure Vitest hoisted APIs are at the top
- `vitest/no-unneeded-async-expect-function` - Disallow unnecessary async in expect functions
- `vitest/prefer-called-once` - Prefer using `toHaveBeenCalledOnce()` over `toHaveBeenCalledTimes(1)`
- `vitest/prefer-describe-function-title` - Prefer using function names in describe blocks

**Vue preset:**

- `vue/no-arrow-functions-in-watch` - Disallow arrow functions in watch options
- `vue/no-lifecycle-after-await` - Disallow lifecycle hooks after await expressions

**Notable bug fixes in oxlint v1.39.0:**

- Fix workspace worker selection for nested and similar-named workspaces in LSP
- Fix `consistent-indexed-object-style` false positive with circular references
- Fix `consistent-indexed-object-style` to skip fixing default exported interfaces
- Fix `prefer-called-once` panic on trailing comma
- Fix panic on invalid `no-unused-vars` configuration
- Move `jsx-a11y/no-static-element-interactions` rule to nursery
- Fix nested search for binaries in VS Code extension

**Notable bug fixes in oxfmt v0.24.0:**

- Fix classes being stripped when both `experimentalTailwindcss` and `experimentalSortImports` are enabled
- Fix nested class strings not respecting `singleQuote: true` in Tailwind CSS
- Fix class names being broken after sorting when containing single quotes with `singleQuote: true`
- Fix incorrect type annotation check for short arguments
- Fix parenthesis wrapping for type assertions in default exports
