---
"adamantite": patch
---

Refactor CLI framework from citty to yargs for improved command parsing

This internal refactoring migrates the CLI implementation to use yargs instead of citty, providing more robust argument parsing and better TypeScript support. The change also introduces import maps with "#*" syntax for cleaner internal module resolution.

**Technical changes:**
- Migrated all command handlers from citty's `defineCommand` to yargs command modules
- Added `#*` import maps in package.json pointing to `./src/*` for path-based imports
- Updated all internal imports to use `#commands/*` and `#utils.ts` syntax
- Added yargs and @types/yargs dependencies (replacing citty)
- Configured TypeScript with `allowImportingTsExtensions` and `noEmit` for import map support
- Updated tsdown config to target node platform explicitly

All CLI commands maintain their existing behavior and user-facing API.