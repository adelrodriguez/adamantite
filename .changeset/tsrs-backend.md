---
"adamantite": minor
---

Run Oxlint's type-aware rules on [tsrs](https://github.com/oxc-project/tsrs) instead of oxlint-tsgolint. `adamantite init` and `adamantite update` install the pinned `tsrs` 0.21.0-ts7.1.0-beta, and `adamantite check`, `adamantite fix`, and the editor settings start it through the toolchain entry. With the `effect` preset, the entry starts the Effect build of tsrs that `@effect/tsgo` ships, so the `effecttsgo` rules run on tsrs too.

On this repository, the full lint takes about 45% less time on tsrs.

To upgrade an existing project:

- Run `adamantite update` to install `tsrs`.
- Remove `oxlint-tsgolint` from `package.json`, and install again. `adamantite doctor` reports it while it stays.
- Expect small differences in type-check results. tsrs 0.21.0 ports TypeScript 7.1 beta, so a project that pins TypeScript 7.0 can get results that differ from `tsc`.
- A plain `oxlint --type-aware` call no longer finds a backend. Run `adamantite check --only lint` instead.
