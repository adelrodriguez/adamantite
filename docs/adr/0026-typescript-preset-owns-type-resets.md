# The TypeScript preset owns its type resets

[ts-reset](https://github.com/total-typescript/ts-reset) changes the global types of built-in
APIs. For example, `JSON.parse()` and `response.json()` return `unknown` instead of `any`. Its
documented setup is a `reset.d.ts` file in each TypeScript program and an `include` entry for each
file. One monorepo that uses Adamantite kept 17 such files and a dependency in a shared tsconfig
package. We decided (2026-11-11, issue #733) that `adamantite/typescript` applies type resets that
Adamantite owns, that they start from ts-reset 0.7.0, and that the new `adamantite/tsconfig` has
the same strict options without them.

## How the preset applies the resets

`presets/typescript.json` extends `presets/tsconfig.json`, lists `typescript/resets/index.d.ts` in
`files`, and sets `"include": ["${configDir}/**/*"]`. A preset `files` list empties the default
include, so the preset must include the extending project's files again. A project that sets its
own `include` keeps the resets. A project that sets its own `files` replaces the preset's list and
loses them, and `"files": []` turns them off. TypeScript 7.0.2 and tsrs both read the inherited
`files`.

Each reset is a script declaration file that merges into a built-in interface, such as
`interface JSON`. TypeScript places the overloads of a merged declaration before the library's
overloads, so a reset that replaces a catch-all overload, such as `Object.values(o: {}): any[]`,
restates the library's specific overloads first. Without them, the catch-all reset would also take
typed calls.

## Why Adamantite owns the resets

- ts-reset's last npm release is 0.6.1, from 2024. Its repository has 0.7.0, which fixes
  `.filter(Boolean)` inside function arguments, gives `Map.groupBy` and `Object.groupBy`
  non-empty groups, and removes `promise-catch` from the recommended set because it breaks promise
  unions. Upstream has not published 0.7.0.
- Adamantite can add stricter resets for the built-in APIs that still return `any`, and change the
  resets that it took from ts-reset.
- The preset loads the resets by a path next to itself, so the target project installs nothing.

The resets started from ts-reset at commit `f36610ba441b8ea1c7cf7349dd71bee26c2e6a3b`, and
`presets/typescript/resets/license.md` keeps ts-reset's MIT notice. Upstream changes do not arrive
by themselves, so a maintainer reviews them by hand. The fixtures in
`src/__tests__/presets/fixtures/typescript/` start from ts-reset's tests.

## Why libraries use `adamantite/tsconfig`

A library that extends `adamantite/typescript` can emit declaration files that name the global
`AdamantiteTypeScript` helper types. For example, `items.filter(Boolean)` in a generic function
emits `AdamantiteTypeScript.NonFalsy<T>[]`. A consumer without the resets and with
`skipLibCheck: false` then gets `TS2503: Cannot find namespace`. Doctor reports a package that
extends `adamantite/typescript`, is not private, and declares `exports` or `types`. `init` asks
which preset to use and does not detect libraries.

## Considered options

- **Vendor ts-reset at a pinned commit.** Upstream updates would arrive through a script, but the
  copy would be generated output that Adamantite cannot change, and stricter resets would need a
  second folder.
- **A separate `adamantite/typescript/reset` config that a project adds to `extends`.** It keeps
  the base preset safe for libraries, but every project must learn a second name and opt in.
- **`compilerOptions.types` in the preset.** A project that sets `types`, such as `["node"]`,
  replaces the preset's list, because tsconfig does not merge arrays.
- **ts-reset as a dependency of Adamantite.** The preset would get only the npm release, 0.6.1.

## Consequences

- A project that extends `adamantite/typescript` gets new type errors after the update. Adamantite
  is below 1.0, so this is a minor version.
- A library that extends `adamantite/typescript` gets a Doctor finding until it extends
  `adamantite/tsconfig`.
- A project that already set up ts-reset can delete its `reset.d.ts` files and its ts-reset
  dependency. Issue #729 tracks a Doctor finding for that migration.
- Merging cannot change a property type, such as `PromiseRejectedResult.reason`, or a default type
  parameter, such as `MessageEvent<T = any>`, so those stay `any`.
- This repository publishes declaration files, so its own `tsconfig.json` extends the plain preset
  and excludes the resets.
