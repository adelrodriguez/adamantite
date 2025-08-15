# adamantite

## 0.4.1

### Patch Changes

- 97afed7: Fix init command and improve codebase maintainability

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
    - Consolidated all test files into **tests** directory
    - Removed 335+ lines of unused code and tests
  - **Improved test organization**:
    - Added semantic test descriptions explaining what and why we're testing
    - Created separate integration tests for file operations
    - Better test structure with nested describe blocks

## 0.4.0

### Minor Changes

- c7edd5c: add editor rules for vscode

### Patch Changes

- 78a93ea: update biome version to 2.1.4
- d0906c4: pin all versions to exact
- 9d10cf1: update typescript peer dependency range
- bdf3962: new title

## 0.3.4

### Patch Changes

- 9280e56: remove package.json caching

## 0.3.3

### Patch Changes

- 97c8ab3: fix monorepo lint script

## 0.3.2

### Patch Changes

- 5f5b8f4: fix `bin` location

## 0.3.1

### Patch Changes

- 1af8e2c: add version title to new version PR

## 0.3.0

### Minor Changes

- c23ec2e: - Add support for running `sherif` to automatically fix monorepo-specific issues
  - Add support for detecting the package manager and using the correct executable path

## 0.2.0

### Minor Changes

- 8d76fbe: Remove unnecessary tsconfig settings

## 0.1.1

### Patch Changes

- e82f852: install `adamantite` during `init`

## 0.1.0

### Minor Changes

- 801a662: Add `init` script

## 0.0.6

### Patch Changes

- 1561814: setup changesets and release workflow
