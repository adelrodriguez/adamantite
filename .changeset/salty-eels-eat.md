---
"adamantite": patch
---

Improve error handling and refactor CLI commands for consistency

**Error Handling Improvements:**
- Enhanced error logging for package manager detection failures across all CLI commands
- Improved user cancellation handling in interactive prompts (`init`, `update`)
- Commands now display clearer error messages when operations fail, making troubleshooting easier

**Refactoring:**
- Refactored all CLI commands (`check`, `ci`, `fix`, `monorepo`, `init`, `update`) to use `.match()` method on `safeTry` results for consistent error handling pattern
- Standardized error handling across the codebase, improving maintainability and readability
- Cleaned up unnecessary intermediate variable assignments in `init` command

**Type Improvements:**
- Updated `types.ts` with more precise type definitions, using `never` for empty error data and optional properties where appropriate
