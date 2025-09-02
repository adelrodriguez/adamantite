---
"adamantite": minor
---

Rename CLI commands for clearer intent: `lint` → `check` and `format` → `fix`

**Breaking Changes:**
- The `lint` command is now `check` and only reports issues (no auto-fixing)
- The `format` command is now `fix` and applies formatting and lint fixes
- Update your scripts and workflows to use the new command names

**Migration:**
- Replace `adamantite lint` with `adamantite check` (for checking only)
- Replace `adamantite format` with `adamantite fix` (for fixing issues)
