---
"adamantite": minor
---

Fold the monorepo scripts into the `analyze` setup. `adamantite init` no longer offers the
`check:monorepo` and `fix:monorepo` scripts, and generated CI workflows and `AGENTS.md`
guidance no longer include them. In a detected monorepo, the `analyze` option says that it
includes Sherif.

Breaking: setup scripts that pass `--script check:monorepo` or `--script fix:monorepo` to
`adamantite init` now fail. Select `--script analyze` instead.
