---
"adamantite": minor
---

`adamantite update` now runs a migration pipeline before dependency updates, so upgrades to the `adamantite check` workflow and related configuration can be checked, applied, validated, and rolled back safely when a migration fails.

This release adds automatic update migrations for legacy Adamantite setups. `adamantite update` can now migrate `.oxlintrc.json` to `oxlint.config.ts`, patch managed `oxlint.config.ts` files so `adamantite check` and `adamantite fix` run with `options.typeAware` and `options.typeCheck` enabled, and replace the legacy `adamantite typecheck` script with the unified `adamantite check` command.

When migrating the legacy `typecheck` script, Adamantite also bootstraps any missing `oxlint.config.ts` and `tsconfig.json` files, updates the GitHub Actions workflow when possible so it runs the new `check` command, and continues syncing managed tooling dependencies to the latest compatible Adamantite versions.
