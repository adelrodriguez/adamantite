---
"adamantite": minor
---

Publish only the documented lint preset imports

The package now exports `adamantite/lint` and each documented `adamantite/lint/<preset>` import by
name. Before, a wildcard export also made the implementation modules below
`dist/presets/lint` importable, such as `adamantite/lint/plugin/options`,
`adamantite/lint/plugin/rules/query-from-loader`, and the undocumented `adamantite/lint/core` alias. Node.js
now rejects these paths with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The unused `main` field is removed,
so the bare `adamantite` import stays unavailable.

To upgrade an existing project, replace an import of `adamantite/lint/core` with
`adamantite/lint`.
