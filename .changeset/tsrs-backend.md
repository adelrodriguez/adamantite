---
"adamantite": minor
---

Run Oxlint's type-aware rules on [tsrs](https://github.com/oxc-project/tsrs) instead of oxlint-tsgolint. `adamantite init` and `adamantite update` install the pinned `tsrs` 0.21.0-ts7.1.0-beta, and `adamantite check`, `adamantite fix`, and the editor settings start it through the Oxlint entry `dist/oxlint.js`. With the `effect` preset, the entry starts the Effect build of tsrs that `@effect/tsgo` ships, so the `effecttsgo` rules run on tsrs too.

On this repository, the full lint takes about 45% less time on tsrs.

To upgrade an existing project:

- Run `adamantite update` to install `tsrs`.
- Remove `oxlint-tsgolint` from `package.json`, and install again. `adamantite doctor` reports it while it stays.
- Expect small differences in type-check results. tsrs 0.21.0 ports TypeScript 7.1 beta, so a project that pins TypeScript 7.0 can get results that differ from `tsc`.
- A plain `oxlint --type-aware` call no longer finds a backend. Run `adamantite check --only lint` instead.
- On Windows ARM64, the type-aware rules no longer run, because tsrs has no Windows ARM64 build yet. [oxc-project/tsrs#903](https://github.com/oxc-project/tsrs/pull/903) adds it for a later tsrs release. Until then, a project that lints on Windows ARM64 can stay on the previous Adamantite version, which runs oxlint-tsgolint.
