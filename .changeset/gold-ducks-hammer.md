---
"adamantite": patch
---

Fix init command and improve codebase maintainability

- **Fix init command crash**: Removed getBiomeVersion function that was causing "Failed to get Biome version" errors when users didn't have Biome installed yet
- **Improved helpers architecture**: 
  - Made version property optional for non-package helpers (tsconfig, vscode)
  - Only biome and sherif helpers now have versions (actual npm packages)
  - Moved package versions into respective helper objects for better organization
- **Enhanced helper functionality**:
  - Fixed vscode helper to properly create .vscode directory
  - Updated config merging to prioritize adamantite settings over existing user configs
  - Added comprehensive integration tests with temporary directory isolation
- **Code cleanup**:
  - Removed unused utility functions (isPackageInstalled, getInstalledPackageVersion, isPackageVersionCorrect)
  - Consolidated all test files into __tests__ directory
  - Removed 335+ lines of unused code and tests
- **Improved test organization**: 
  - Added semantic test descriptions explaining what and why we're testing
  - Created separate integration tests for file operations
  - Better test structure with nested describe blocks
