# The TypeScript preset vendors ts-reset

[ts-reset](https://github.com/total-typescript/ts-reset) changes the global types of built-in
APIs. For example, `JSON.parse()` and `response.json()` return `unknown` instead of `any`. Its
documented setup is a `reset.d.ts` file in each TypeScript program and an `include` entry for each
file. One monorepo that uses Adamantite kept 17 such files and a dependency in a shared tsconfig
package. We decided (2026-11-11, issue #733) that `adamantite/typescript` applies the ts-reset
types, that the new `adamantite/tsconfig` has the same strict options without them, and that
Adamantite vendors the ts-reset declarations.

## How the preset applies the types

`presets/typescript.json` extends `presets/tsconfig.json`, lists the vendored entry points in
`files`, and sets `"include": ["${configDir}/**/*"]`. A preset `files` list empties the default
include, so the preset must include the extending project's files again. A project that sets its
own `include` keeps the types. A project that sets its own `files` replaces the preset's list and
loses them, and `"files": []` turns them off. TypeScript 7.0.2 and tsrs both read the inherited
`files`.

The vendored set is the upstream recommended set and `storage.d.ts`, so property reads on
`localStorage` and `sessionStorage` return `unknown`. Upstream ships `storage.d.ts` only in its
`dom` entry point. Without the DOM library, the file declares an interface that nothing uses.

## Why libraries use `adamantite/tsconfig`

A library that extends `adamantite/typescript` can emit declaration files that name the global
`TSReset` helper types. For example, `items.filter(Boolean)` in a generic function emits
`TSReset.NonFalsy<T>[]`. A consumer without ts-reset and with `skipLibCheck: false` then gets
`TS2503: Cannot find namespace 'TSReset'`. Doctor reports a package that extends
`adamantite/typescript`, is not private, and declares `exports` or `types`. `init` asks which
preset to use and does not detect libraries.

## Why Adamantite vendors ts-reset

ADR 0003 keeps a third-party package that is published on npm as an npm package, and vendors only
plugins that are not published. ts-reset is on npm, but these reasons differ from the
`@shadcn/lint` case:

- npm has ts-reset 0.6.1 from 2024. The upstream repository has 0.7.0, which fixes
  `.filter(Boolean)` inside function arguments, gives `Map.groupBy` and `Object.groupBy`
  non-empty groups, and removes `promise-catch` from the recommended set because it breaks promise
  unions. Upstream has not published 0.7.0.
- The declarations are about 4 KB with no runtime code, so every install carries little.
- The preset loads them by a path next to itself, so the target project installs nothing and no
  package resolution can fail.

`scripts/vendor-ts-reset.ts` copies the entry points and each file that they reference at a pinned
commit, with the upstream license.

## Considered options

- **A separate `adamantite/typescript/reset` config that a project adds to `extends`.** It keeps
  the base preset safe for libraries, but every project must learn a second name and opt in.
- **`compilerOptions.types` in the preset.** A project that sets `types`, such as `["node"]`,
  replaces the preset's list, because tsconfig does not merge arrays.
- **ts-reset as a dependency of Adamantite.** The preset would resolve it from the installed
  package, but it would get only the npm release, 0.6.1.

## Consequences

- A project that extends `adamantite/typescript` gets new type errors after the update. Adamantite
  is below 1.0, so this is a minor version.
- A library that extends `adamantite/typescript` gets a Doctor finding until it extends
  `adamantite/tsconfig`.
- A project that already set up ts-reset can delete its `reset.d.ts` files and its ts-reset
  dependency. Issue #729 tracks a Doctor finding for that migration.
- This repository publishes declaration files, so its own `tsconfig.json` extends the plain preset
  and excludes the vendored folder.
