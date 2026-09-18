---
"adamantite": patch
---

Clean up command output. `check`, `fix`, and `analyze` now print a heading before each tool runs (for example `✨ Checking formatting · adamantite (oxfmt)` and `🔍 Linting · adamantite (oxlint)`) so it is clear which step produced the output below it. Spawned tools also run with `--disable-warning=MODULE_TYPELESS_PACKAGE_JSON` appended to `NODE_OPTIONS`, which silences the Node warning printed when a TypeScript config is loaded in a project whose `package.json` has no `"type"` field.
