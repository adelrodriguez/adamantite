---
"adamantite": minor
---

Fail `adamantite check` when Oxlint reports a warning

A project with warnings, such as reports of the rules that a preset sets to `warn`, fails `check` after the update. Pass `--allow-warnings` to keep the old behavior. The flag changes only the lint stage, so `check --only format --allow-warnings` fails with "Invalid check options".
