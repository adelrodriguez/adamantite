---
"adamantite": minor
---

Consolidate type checking into `adamantite check` by generating Oxlint configs with `options.typeAware` and `options.typeCheck`, and removing the standalone `typecheck` workflow from init, docs, and CI while deprecating the `typecheck` command.

`adamantite update` now migrates the legacy `typecheck` script to `check`, installs the required Oxlint dependencies, and creates the missing Oxlint and TypeScript config files needed by the new workflow.

`adamantite init` now asks before extending `tsconfig.json` with `adamantite/typescript`, and it no longer installs `typescript` automatically.
