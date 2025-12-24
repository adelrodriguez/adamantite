---
"adamantite": minor
---

Improve `init` and `monorepo` commands with better UX

The `init` command now provides clearer interactive prompts using @clack/prompts, detects monorepo configurations automatically, and offers granular control over which scripts to install. Users can choose individual scripts (check, fix, check:monorepo, fix:monorepo) instead of all-or-nothing installation.

The `monorepo` command now requires the `--fix` flag to auto-fix issues. Running without the flag only checks for issues, making the behavior consistent with the `check` command and preventing unintended modifications.