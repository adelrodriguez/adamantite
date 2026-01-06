---
"adamantite": minor
---

Reorganize preset directory structure and update linting rules

**Breaking Changes:**

- Renamed `presets/oxfmt.json` → `presets/format.json`
- Renamed `presets/oxlint/` → `presets/lint/`
- Removed 8 linting rules from core preset:
  - `import/export` - Duplicate export detection (now handled by TypeScript)
  - `import/no-named-as-default` - Named import conflicts (now handled by TypeScript)
  - `import/no-named-as-default-member` - Member access on default export (now handled by TypeScript)
  - `new-cap` - Constructor capitalization (stylistic preference)
  - `typescript/only-throw-error` - Enforce throwing Error objects (too restrictive)
  - `unicorn/no-anonymous-default-export` - Require named exports (too opinionated)
  - `unicorn/no-array-for-each` - Prefer for-of over forEach (stylistic preference)
  - `unicorn/prefer-string-raw` - Use String.raw for template literals (too aggressive)
- Added 1 new linting rule:
  - `sort-keys` - Enforce sorted object keys for consistency

Users referencing these presets directly in their configuration files will need to update their paths. If you're extending Adamantite presets using the `adamantite/*` shorthand (e.g., `"extends": "adamantite/lint"`), no changes are required.

**Also includes:**

- Update oxlint to 1.37.0 (from 1.36.0)
- Update oxfmt to 0.22.0 (from 0.21.0)
- Update knip to 5.80.0 (from 5.79.0)
- Enable type-aware linting in VSCode settings
