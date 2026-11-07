---
"adamantite": patch
---

`adamantite analyze` no longer reports custom rule files as unused files. The `adamantite/analyze` preset adds the rule files and optional `.test.*` files in `.adamantite/lint/` as Knip entry files, in the root and in each workspace package, and keeps Knip's default entry files. Knip still reports a helper file that starts with `_` when no file imports it.
