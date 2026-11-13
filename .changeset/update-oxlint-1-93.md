---
"adamantite": minor
---

Update the managed tooling versions: Oxlint 1.93.0, Oxfmt 0.78.0, tsrs 0.25.0-ts7.1.0-beta, Knip 6.45.1, and `@effect/tsgo` 0.69.0. Also update the runtime dependencies `@oxlint/plugins` to 1.93.0 and `@clack/prompts` to 1.9.0.

The type-aware rules now have builds for Windows ARM64: tsrs 0.25.0 publishes `@tsrs/win32-arm64`, and `@effect/tsgo` 0.69.0 ships a Windows ARM64 build of tsrs.

The effect preset enables the two new `@effect/tsgo` rules:

- `effecttsgo/missing-concurrency-option` reports an `Effect.all` or `Effect.forEach` call without a `concurrency` option. These calls run one effect at a time unless the option says otherwise.
- `effecttsgo/on-exit-failure-to-on-error` reports an `Effect.onExit` callback that acts only on failure, which `Effect.onError` replaces.

Oxlint 1.92.0 and later find the `tsrs-lint` launcher in `node_modules/.bin` themselves. Outside Windows, the Oxlint entry that `adamantite check`, `adamantite fix`, and the editors run no longer names the launcher in `OXLINT_TSGOLINT_PATH`.

The optional peer ranges move to `oxlint` 1.92.0 or later and `tsrs` 0.25.0-ts7.1.0-beta or later. npm rejected tsrs 0.25.0-ts7.1.0-beta against the old range, because a prerelease matches a range only through a version with the same major, minor, and patch.

To upgrade an existing project:

- Run `adamantite update` to install the new versions.
- In a project with the effect preset, expect `adamantite check` to report `Effect.all` and `Effect.forEach` calls without a `concurrency` option. Add `{ concurrency: 1 }` to keep the current order, or set the concurrency that the code needs.
- In a Vue project, expect `adamantite fix` to format `.vue` files differently. Oxfmt 0.77.0 formats them with its own formatter instead of Prettier (oxc-project/oxc#28848).
- In an Astro project, expect `adamantite fix` to format `.astro` files. The format preset turns on Oxfmt's `astro` option, and Zed and VS Code format Astro files with Oxfmt. Oxfmt needs `@astrojs/compiler-rs`, which Astro 7 and later install. In an Astro 5 or 6 project, Oxfmt fails on `.astro` files, and Doctor reports it. Update Astro to 7. Run `adamantite init` with your editors to move Zed's Astro setup from Prettier to Oxfmt.
