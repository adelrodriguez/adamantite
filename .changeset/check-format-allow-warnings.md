---
"adamantite": patch
---

Reject `--allow-warnings` with `adamantite check --only format`

`--allow-warnings` changes only the lint stage, so `check --only format --allow-warnings` ignored it without notice. `check` now fails with "Invalid check options" for this combination, as `fix --only format --all` and `analyze --only monorepo --strict` already do for their lint-only and unused-only flags.
