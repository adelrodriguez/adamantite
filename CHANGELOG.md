# adamantite

## 0.13.0

### Minor Changes

- 073c7a8: Update Biome to 2.3.2 and enable script/style tag indentation

  **Updated Dependencies:**

  Core dependencies:

  - `@biomejs/biome` from 2.3.0 to 2.3.2

  Development dependencies:

  - `tsdown` from 0.15.9 to 0.15.11

  **Configuration Changes:**

  - **Script and style indentation**: Changed `indentScriptAndStyle` from `false` to `true` in the HTML formatter configuration. This enables automatic indentation of code within `<script>` and `<style>` tags in HTML and JSX files, improving code readability and consistency. Previously, content within these tags was not indented, but now they will be formatted with proper indentation matching the rest of the document.

  These updates bring the latest bug fixes and improvements from Biome 2.3.2, along with enhanced formatting consistency for HTML and JSX files containing embedded scripts and styles.

## 0.12.0

### Minor Changes

- 0b1598e: Update Biome to 2.3.0 and improve configuration defaults

  **Updated Dependencies:**

  Core dependencies:

  - `@biomejs/biome` from 2.2.6 to 2.3.0

  Development dependencies:

  - `@types/bun` from 1.3.0 to 1.3.1
  - `sherif` from 1.6.1 to 1.7.0
  - `tsdown` from 0.15.7 to 0.15.9

  **Configuration Changes:**

  - **Line endings**: Changed from `"lf"` to `"auto"` for better cross-platform compatibility. The formatter will now preserve the existing line ending style in files rather than enforcing Unix-style line endings.
  - **New rule**: Added `useImageSize` rule (set to `"error"`) to enforce width and height attributes on image elements for improved performance and layout stability.

  **Development Environment:**

  - VSCode settings updated to use Biome as the default formatter
  - Added `test/` directory for future test infrastructure

  These updates bring the latest improvements and bug fixes from Biome 2.3.0, along with enhanced cross-platform support and additional best practices for web development.

## 0.11.1

### Patch Changes

- 3121c4e: Update development dependencies to their latest versions

  Updated the following devDependencies:

  - `@biomejs/biome` from 2.2.5 to 2.2.6
  - `@types/bun` from 1.2.23 to 1.3.0
  - `tsdown` from 0.15.6 to 0.15.7
  - `type-fest` from 5.0.1 to 5.1.0

  These updates include minor improvements and bug fixes from the upstream packages.

## 0.11.0

### Minor Changes

- 4df55ba: Restructure Biome configuration to use extends pattern and move presets to src directory

  **Breaking Changes:**

  The package structure has been reorganized to consolidate presets in the `src/presets` directory and adopt a more maintainable configuration pattern:

  - **Biome configuration**: The root `biome.jsonc` now extends from `src/presets/biome.jsonc` instead of containing the full configuration inline
  - **TypeScript preset**: Moved from `presets/tsconfig.json` to `src/presets/tsconfig.json` for consistency
  - **Package exports**: Added clean export paths via package.json exports field:
    - `adamantite` → Biome configuration (default export)
    - `adamantite/biome` → Biome configuration (explicit)
    - `adamantite/tsconfig` → TypeScript configuration (new clean path)
    - `adamantite/presets/*` → Direct preset access (fallback)
  - **Schema references**: Updated to use local Biome schema paths (`./node_modules/@biomejs/biome/configuration_schema.json`) instead of remote URLs
  - **TypeScript preset**: Removed `verbatimModuleSyntax` setting to improve compatibility with both ESM and CommonJS projects

  **Migration:**

  If you're importing Adamantite's Biome configuration:

  - Update imports from `adamantite/biome.jsonc` to `adamantite` (the package main export)
  - If extending the TypeScript preset, update the path from `adamantite/presets/tsconfig.json` to `adamantite/tsconfig`
  - If your project relies on `verbatimModuleSyntax`, add it to your local tsconfig.json as it's no longer included in the preset

  **Internal improvements:**

  - Tests now validate local schema paths instead of remote URL formats, improving offline development experience
  - Configuration structure better aligns with modern preset patterns using `extends`

## 0.10.0

### Minor Changes

- f975e73: /

## 0.9.5

### Patch Changes

- 1aa1ba2: Enhanced `useFilenamingConvention` rule to support special characters in filenames

  Updated the filename convention rule with a custom `match` regex pattern that allows special characters such as `$`, `[`, and `]` in filenames while maintaining kebab-case naming conventions. This change enables proper validation of framework-specific file naming patterns, such as Next.js dynamic routes (`[id].ts`, `[...slug].ts`) and SvelteKit route parameters (`$lib`, `[param].svelte`), without triggering false positive linting errors.

## 0.9.4

### Patch Changes

- cd272f9: Allow non-ASCII characters in filenames by setting `requireAscii: false` in the `useFilenameConvention` rule

  The Biome configuration now permits special characters like `$` in filenames while maintaining the `kebab-case` naming requirement. This change resolves linting errors for route files with special characters (e.g., `auth.$.ts` in web frameworks that use `$` for dynamic routes) without compromising the overall filename convention standards.

## 0.9.3

### Patch Changes

- 4b6df97: Migrate CLI framework from Commander.js to citty for improved developer experience. This change brings better type safety through citty's TypeScript-first design, improved ergonomics as part of the UnJS ecosystem, and a more declarative command definition API.

  Key improvements:

  - **Better type safety**: Commands are now defined using `defineCommand()` with fully typed argument definitions
  - **Declarative API**: Command metadata, arguments, and handlers are defined in a single, clear structure rather than chained method calls
  - **Improved DX**: Arguments are automatically parsed and typed, with built-in support for positional arguments, boolean flags, and command metadata
  - **UnJS ecosystem**: citty is part of the UnJS ecosystem, providing better compatibility with other modern JavaScript tooling and conventions

- 67d8ea3: Update development dependencies and TypeScript peer dependency requirement

  - Update tsdown from 0.15.2 to 0.15.6 for improved build performance and bug fixes
  - Update type-fest from 5.0.0 to 5.0.1 for latest type utilities
  - Update TypeScript from 5.9.2 to 5.9.3 for latest compiler improvements
  - Update TypeScript peer dependency to >=5.6.0 (required for noUncheckedSideEffectImports compiler option)

  This ensures compatibility with the TypeScript preset's `noUncheckedSideEffectImports` option which requires TypeScript 5.6 or higher.

## 0.9.2

### Patch Changes

- 590dbfd: Relax filename convention rules in Biome configuration

  Removed the restrictive `match` pattern constraint from the `useFilenameConvention` rule while keeping the `kebab-case` requirement. This change makes the linting rules more permissive by removing the overly restrictive regex pattern matching, which can help reduce false positives in projects with diverse naming requirements.

## 0.9.1

### Patch Changes

- 16eef0d: Remove Next.js-specific Biome rules from general-purpose TypeScript preset

  Removed `noHeadElement` and `noHeadImportInDocument` rules that are specific to Next.js framework usage. These rules prevent using HTML `<head>` elements and importing head-related functionality in wrong contexts, but they can cause false positives and confusion in non-Next.js TypeScript projects.

  As a general-purpose TypeScript preset, Adamantite should focus on universal TypeScript and JavaScript best practices rather than framework-specific rules. Projects using Next.js can enable these rules through Biome's Next.js domain configuration when needed.

## 0.9.0

### Minor Changes

- 6d7a5a3: Add noUncheckedSideEffectImports to TypeScript preset for enhanced type safety

  The TypeScript preset now includes the `noUncheckedSideEffectImports` compiler option, which helps prevent potential runtime errors from unchecked side effects in imports. Additionally, compiler options in the preset have been reorganized alphabetically for better maintainability.

### Patch Changes

- 3c86461: Update dependencies to latest versions for improved stability and performance

  - Update Biome from 2.2.2 to 2.2.4
  - Update commander from 14.0.0 to 14.0.1
  - Update nypm from 0.6.1 to 0.6.2
  - Update build and development dependencies (tsdown, type-fest, @changesets/cli, @types/bun)

## 0.8.0

### Minor Changes

- b8ed24b: Rename CLI commands for clearer intent: `lint` → `check` and `format` → `fix`

  **Breaking Changes:**

  - The `lint` command is now `check` and only reports issues (no auto-fixing)
  - The `format` command is now `fix` and applies formatting and lint fixes
  - Update your scripts and workflows to use the new command names

  **Migration:**

  - Replace `adamantite lint` with `adamantite check` (for checking only)
  - Replace `adamantite format` with `adamantite fix` (for fixing issues)

## 0.7.2

### Patch Changes

- dfa0225: Update Biome to v2.2.2 for improved linting and formatting

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
