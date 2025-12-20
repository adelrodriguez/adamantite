---
"adamantite": minor
---

Improve Biome preset defaults and refactor internal error handling

This release updates the Biome formatter preset with more practical defaults and includes significant internal improvements to error handling and code organization. All changes are backwards compatible - CLI commands and package exports remain unchanged.

**Biome Preset Updates:**

- **Increased line width** from 80 to 100 characters for better readability on modern displays
- **Relaxed cognitive complexity** rule from error to warning level and increased threshold from 20 to 40 for more pragmatic complexity checks
- These changes will affect formatting and linting output but can be overridden in your local `biome.jsonc` configuration

**Internal Refactoring:**

- **Result-based error handling**: Introduced `neverthrow` library for type-safe error handling across all commands, replacing try-catch patterns with composable Result types
- **Improved error messages**: All commands now provide better error context using structured error flattening
- **Modular helper organization**: Restructured helper functions from monolithic file into organized modules:
  - `src/helpers/editors/vscode.ts` - VSCode configuration
  - `src/helpers/packages/biome.ts` - Biome package management  
  - `src/helpers/packages/sherif.ts` - Sherif package management
  - `src/helpers/tsconfig.ts` - TypeScript configuration
- **Relocated preset files** from `src/presets/` to `presets/` directory (package exports unchanged - users are unaffected)

**Dependencies:**

- Added `neverthrow@8.2.0` for Result type handling
- Added `faultier@^1.0.3` for error utilities
- Moved `yargs` from devDependencies to dependencies