# adamantite

## 0.7.1

### Patch Changes

- 9793d28: Refactor dependency management to use nypm API and improve update command reliability

  - Replace custom `runProcess` utility with nypm's `dlxCommand` and `addDevDependency` functions
  - Improve package manager detection using nypm's built-in detection instead of manual lock file checking
  - Update all command files to use consistent error handling and execution patterns
  - Remove unused utilities and corresponding test cases
  - Fix update command error handling to use Promise.allSettled() instead of sequential await in loops
  - Enhance update command to attempt all dependency updates and report detailed success/failure status
  - Improve TypeScript compatibility and resolve linter warnings in update command
  - Add nypm as a dependency to enable more robust package manager operations

## 0.7.0

### Minor Changes

- a6a1853: Add `ci` command for continuous integration workflows with enhanced reporter options.

  ## CLI Enhancements

  - **Added**: `ci` command for running Biome CI checks in continuous integration environments
  - **Added**: `--github` flag to the `ci` command for GitHub Actions reporter output
  - **Added**: `--monorepo` flag to the `ci` command for additional monorepo-specific checks using Sherif
  - **Refactored**: Command option handling to use consistent destructured options pattern across all commands

  This update adds CI-specific functionality optimized for automated environments while maintaining compatibility with existing lint and format commands.

## 0.6.0

### Minor Changes

- 427b34f: Comprehensive update to Biome configuration rules with stricter linting and formatting standards.

  ## Rule Changes

  ### A11y Section

  - **Added**: `noAutofocus` - error (previously off)
  - **Added**: `noNoninteractiveElementInteractions` - error
  - **Reorganized**: Better organization with JavaScript and CSS subsections
  - **Removed**: Verbose rule comments for cleaner configuration

  ### Complexity Section

  - **Added 25+ new rules** including:
    - `noExtraBooleanCast` - error
    - `noStaticOnlyClass` - error
    - `noThisInStatic` - error
    - `noUselessContinue` - error
    - `noUselessEmptyExport` - error
    - `noUselessEscapeInRegex` - error
    - `noUselessFragments` - error
    - `noUselessLabel` - error
    - `noUselessLoneBlockStatements` - error
    - `noUselessRename` - error
    - `noUselessStringConcat` - error
    - `noUselessStringRaw` - error
    - `noUselessSwitchCase` - error
    - `noUselessTernary` - error
    - `noUselessThisAlias` - error
    - `noUselessTypeConstraint` - error
    - `noUselessUndefinedInitialization` - error
    - `useArrowFunction` - error
    - `useDateNow` - error
    - `useFlatMap` - error
    - `useLiteralKeys` - error
    - `useNumericLiterals` - error
    - `useOptionalChain` - error
    - `useRegexLiterals` - error
    - `useSimpleNumberKeys` - error
  - **Changed**: `maxAllowedComplexity` increased from 18 to 20

  ### Correctness Section

  - **Added**: `noGlobalDirnameFilename` - error
  - **Added**: `noNestedComponentDefinitions` - error
  - **Added**: `noProcessGlobal` - off
  - **Added**: `useJsonImportAttributes` - error
  - **Added**: `useParseIntRadix` - error
  - **Added**: `useSingleJsDocAsterisk` - error
  - **Added**: `useUniqueElementIds` - error (previously off)
  - **Added**: `noReactPropAssignments` - error
  - **Added**: `noRestrictedElements` - error
  - **Removed**: `noUndeclaredDependencies` - off
  - **Removed**: `useImportExtensions` - off

  ### Nursery Section

  - **Enabled previously disabled rules**:
    - `noFloatingPromises` - error (was off)
    - `noMisusedPromises` - error (was off)
  - **Added**: `noNonNullAssertedOptionalChain` - error
  - **Added**: `noUnnecessaryConditions` - error
  - **Added**: `useReactFunctionComponents` - error
  - **Added**: `useAnchorHref` - error
  - **Removed**: `useExplicitType` - off
  - **Removed**: `noSecrets` - off
  - **Removed**: `noImportCycles` - off

  ### Performance Section

  - **Removed**: `noBarrelFile` - off
  - **Removed**: `noImgElement` - error
  - **Removed**: `noNamespaceImport` - off
  - **Removed**: `noReExportAll` - off

  ### Style Section

  - **Added**: `useConsistentObjectDefinitions` - error
  - **Added**: `useExportsLast` - error (was off)
  - **Added**: `useGroupedAccessorPairs` - error
  - **Added**: `useNumericSeparators` - error
  - **Added**: `useObjectSpread` - error
  - **Added**: `useSymbolDescription` - error
  - **Changed**: `useExplicitLengthCheck` - error (was off)
  - **Changed**: `useSingleVarDeclarator` - error (was off)
  - **Removed**: `noCommonJs` - off
  - **Removed**: `noDefaultExport` - off
  - **Removed**: `noNestedTernary` - off
  - **Removed**: `noProcessEnv` - off
  - **Removed**: `useComponentExportOnlyModules` - off

  ### Suspicious Section

  - **Added**: `noBitwiseOperators` - error
  - **Added**: `noConstantBinaryExpressions` - error
  - **Added**: `noTsIgnore` - error
  - **Added**: `noUselessEscapeInString` - error
  - **Added**: `noUselessRegexBackrefs` - error
  - **Added**: `useIterableCallbackReturn` - error
  - **Added**: `useStaticResponseMethods` - error
  - **Added**: `noBiomeFirstException` - error
  - **Added**: `noQuickfixBiome` - error

  ## CLI Enhancements

  - **Added**: `--summary` flag to the `lint` command for concise lint result reporting using Biome's summary reporter

  This update significantly strengthens the linting rules with a focus on code quality, consistency, and best practices while maintaining TypeScript and React compatibility.

### Patch Changes

- 6922455: remove noBarrelFile rule

## 0.5.1

### Patch Changes

- d0f9127: Update Biome version from 2.1.4 to 2.2.0

  - Updated package dependency and configuration schema
  - Migrated renamed rules to new naming conventions
  - Moved promoted rules from nursery to stable groups:
    - `noAwaitInLoops` moved to performance group
    - `noUselessRegexBackrefs` moved to suspicious group
  - Added new rules:
    - `noBarrelFile`

## 0.5.0

### Minor Changes

- ee92238: Add `update` command to keep dependencies in sync

  Adds a new `adamantite update` command that updates installed dependencies (@biomejs/biome and sherif) to match the versions specified by adamantite. The command automatically detects the package manager, compares versions, and updates only outdated packages with user confirmation.

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
