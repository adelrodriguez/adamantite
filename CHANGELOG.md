# adamantite

## 0.27.0

### Minor Changes

- 461bbd7: Add new rules from oxlint v1.39.0 and oxfmt v0.24.0:

  **Core preset (`typescript/`):**
  - `typescript/prefer-optional-chain` - Prefer using optional chain expressions instead of logical AND chains

  **Vitest preset:**
  - `vitest/consistent-each-for` - Enforce consistent usage of `each` for test cases
  - `vitest/hoisted-apis-on-top` - Ensure Vitest hoisted APIs are at the top
  - `vitest/no-unneeded-async-expect-function` - Disallow unnecessary async in expect functions
  - `vitest/prefer-called-once` - Prefer using `toHaveBeenCalledOnce()` over `toHaveBeenCalledTimes(1)`
  - `vitest/prefer-describe-function-title` - Prefer using function names in describe blocks

  **Vue preset:**
  - `vue/no-arrow-functions-in-watch` - Disallow arrow functions in watch options
  - `vue/no-lifecycle-after-await` - Disallow lifecycle hooks after await expressions

  **Notable bug fixes in oxlint v1.39.0:**
  - Fix workspace worker selection for nested and similar-named workspaces in LSP
  - Fix `consistent-indexed-object-style` false positive with circular references
  - Fix `consistent-indexed-object-style` to skip fixing default exported interfaces
  - Fix `prefer-called-once` panic on trailing comma
  - Fix panic on invalid `no-unused-vars` configuration
  - Move `jsx-a11y/no-static-element-interactions` rule to nursery
  - Fix nested search for binaries in VS Code extension

  **Notable bug fixes in oxfmt v0.24.0:**
  - Fix classes being stripped when both `experimentalTailwindcss` and `experimentalSortImports` are enabled
  - Fix nested class strings not respecting `singleQuote: true` in Tailwind CSS
  - Fix class names being broken after sorting when containing single quotes with `singleQuote: true`
  - Fix incorrect type annotation check for short arguments
  - Fix parenthesis wrapping for type assertions in default exports

### Patch Changes

- ee94947: Update tooling dependencies to latest versions for improved stability and performance.

## 0.26.0

### Minor Changes

- 0663946: Remove support for passing positional file lists to `adamantite analyze`.

  Use your Knip config (or run `knip` directly) to scope analysis instead.

## 0.25.0

### Minor Changes

- db437e7: Replace Tailwind CSS lint preset with experimental formatting options

  The `adamantite/lint/tailwind` preset has been removed. Tailwind CSS class sorting is now handled via oxfmt's `experimentalTailwindcss` option, which is already enabled in the `adamantite` format preset.

  If you were using the Tailwind lint preset, simply remove it from your configuration. Class sorting will be handled automatically when formatting with `adamantite format`.

## 0.24.0

### Minor Changes

- 32c0900: Add Tailwind CSS lint preset via eslint-plugin-better-tailwindcss

  New framework-specific preset available at `adamantite/lint/tailwind` for projects using Tailwind CSS. Includes rules for class ordering, duplicate detection, and best practices via [eslint-plugin-better-tailwindcss](https://www.npmjs.com/package/eslint-plugin-better-tailwindcss).

  Refactored oxlint helper to support plugin architecture for extensibility.

## 0.23.0

### Minor Changes

- c09d6de: Reorganize preset directory structure and update linting rules

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

## 0.22.1

### Patch Changes

- 278b75b: Improve dependency installation performance by batching packages

  Install and update commands now install multiple dependencies in a single package manager call instead of sequentially, reducing total installation time.

## 0.22.0

### Minor Changes

- 15f55ba: Add knip preset for dependency analysis

  Ships new `adamantite/analyze` preset with opinionated knip rules for detecting unused files, dependencies, and exports. Includes sensible defaults: errors on unused files/dependencies, warnings on unused exports/types, and ignores common build/dist directories.

  The init command now installs relevant VS Code extensions based on selected scripts (OXC for lint/fix, Knip for analyze, TypeScript Native Preview for typecheck).

  Also updates oxlint core rules to allow tagged templates and ternaries in expressions.

  Updates tooling dependencies: knip 5.79.0, oxfmt 0.21.0, oxlint 1.36.0, oxlint-tsgolint 0.10.1, and TypeScript native preview 7.0.0-dev.20260103.1.

## 0.21.0

### Minor Changes

- e29fd96: Add `analyze` command for finding unused code with knip

  Finds unused dependencies, exports, and files in your project. Supports `--fix` to auto-remove issues and `--strict` for production-focused analysis.

## 0.20.0

### Minor Changes

- 5849d6c: Add automatic editor extension installation during setup

  The `init` command now prompts to install recommended editor extensions (like oxc.oxc-vscode) automatically, improving the initial setup experience.

## 0.19.0

### Minor Changes

- fa77059: Add tsgo (TypeScript Go) as type checker

  The `typecheck` command now uses `tsgo` instead of `tsc` for faster type checking. During initialization, `@typescript/native-preview` is installed instead of `typescript`.

### Patch Changes

- 00fe130: Add framework preset selection to init command

  The `adamantite init` command now prompts for presets (React, Next.js, Vue, Jest, Vitest, Node) when choosing linting scripts. Selected presets are automatically applied to the oxlint configuration, eliminating manual setup.

  Also adds new framework presets with complete rule sets: Next.js (`nextjs.json`), Jest (`jest.json`), Vitest (`vitest.json`), and Vue.js (`vue.json`). Expands React preset (`react.json`) with React/JSX-a11y/React-perf rules and adds `node/no-exports-assign` to Node.js preset (`node.json`).

## 0.18.0

### Minor Changes

- b0ccb57: Replace Biome with oxlint and oxfmt for linting and formatting

  **Breaking changes:**
  - `biome.jsonc` is no longer supported - use `.oxlintrc.json` and `.oxfmtrc.jsonc` instead
  - Configuration now extends `adamantite/lint` (oxlint) and uses oxfmt for formatting
  - Biome must be uninstalled - `oxlint` and `oxfmt` are the new peer dependencies
  - CLI commands (`check`, `fix`, `format`) now use oxlint/oxfmt instead of Biome

  **New features:**
  - Modular oxlint presets: `core`, `react`, and `next` configurations
  - 500+ linting rules (up from 200+ with Biome)
  - 10-40x faster linting performance
  - Separate formatting configuration via oxfmt

  Run `adamantite update` to migrate existing projects automatically.

- 6a43df7: Add `typecheck` command to run TypeScript type checking

  Runs `tsc --noEmit` to check for type errors. Supports `--project` flag to specify custom tsconfig path and `--watch` flag for continuous type checking.

  Improve generated GitHub Actions workflows with matrix strategy, caching, and optimizations. Workflows now use a matrix strategy to run jobs in parallel, cache dependencies for faster builds, skip documentation-only changes, and use minimal required permissions.

## 0.17.0

### Minor Changes

- f929f82: Add optional GitHub Actions workflow setup during init
  - Added a new prompt during `adamantite init` to optionally create a GitHub Actions workflow
  - The workflow runs all enabled check scripts (check, format, typecheck, check:monorepo)
  - Automatically uses the detected package manager (npm, yarn, pnpm, or bun) with the correct setup steps
  - Creates `.github/workflows/adamantite.yml` with proper caching and concurrency settings
  - Removed the `ci` command in favor of the generated workflow approach

## 0.16.0

### Minor Changes

- 18abadb: Add TypeScript checking option and improve preset export naming

  **Breaking Change:**
  - **Export path update**: The TypeScript preset export has been renamed from `adamantite/tsconfig` to `adamantite/typescript` for better clarity and consistency with package naming conventions

  **New Features:**
  - **TypeScript checking option**: The `init` command now includes a `typecheck` script option that runs `tsc --noEmit` for type-checking without emitting files
  - **Conditional TypeScript installation**: TypeScript is now only installed as a dependency when the `typecheck` option is selected, reducing unnecessary dependencies
  - **Enhanced init flow**: Users can now choose to include TypeScript type-checking as part of their development workflow during initialization

  **Migration:**

  If you're currently using the TypeScript preset, update your `tsconfig.json`:

  ```diff
  {
  -  "extends": "adamantite/tsconfig"
  +  "extends": "adamantite/typescript"
  }
  ```

## 0.15.0

### Minor Changes

- 4f94699: Add `format` command powered by oxfmt

  Formats JavaScript, TypeScript, JSX, TSX, JSON, JSONC, and CSS files using oxfmt (oxc's formatter). The formatter is configured via `.oxfmtrc.json` with opinionated defaults including:
  - 100 character line width
  - 2 space indentation
  - No semicolons
  - Sorted imports with customizable grouping
  - Trailing commas for ES5 compatibility

  Configuration is automatically generated when running `adamantite init` or `adamantite update`. VSCode settings are updated to use oxc-vscode extension as the default formatter.

- 69cb0be: Improve `init` and `monorepo` commands with better UX

  The `init` command now provides clearer interactive prompts using @clack/prompts, detects monorepo configurations automatically, and offers granular control over which scripts to install. Users can choose individual scripts (check, fix, check:monorepo, fix:monorepo) instead of all-or-nothing installation.

  The `monorepo` command now requires the `--fix` flag to auto-fix issues. Running without the flag only checks for issues, making the behavior consistent with the `check` command and preventing unintended modifications.

### Patch Changes

- ded7779: Update faultier dependency to improve error handling and CLI output

## 0.14.2

### Patch Changes

- 1cd1eea: Improve error handling and refactor CLI commands for consistency

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

## 0.14.1

### Patch Changes

- f2a9cd1: Migrate build tool from tsdown to bunup

  Updates the build configuration to use bunup instead of tsdown for bundling the CLI. This is an internal tooling change that improves build performance and aligns with Bun's ecosystem, with no impact on the public API or CLI functionality.

- 9c4ba8c: Improve error handling across CLI commands

  Enhances error handling in all CLI commands by adding proper error logging for package manager detection failures and improving user cancellation handling in interactive prompts. Commands now display clearer error messages when package manager detection fails or when users cancel interactive operations, making troubleshooting easier and providing better user experience.

## 0.14.0

### Minor Changes

- a3edadb: Improve Biome preset defaults and refactor internal error handling

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

## 0.13.2

### Patch Changes

- 00b3f0c: Refactor CLI framework from citty to yargs for improved command parsing

  This internal refactoring migrates the CLI implementation to use yargs instead of citty, providing more robust argument parsing and better TypeScript support. The change also introduces import maps with "#\*" syntax for cleaner internal module resolution.

  **Technical changes:**
  - Migrated all command handlers from citty's `defineCommand` to yargs command modules
  - Added `#*` import maps in package.json pointing to `./src/*` for path-based imports
  - Updated all internal imports to use `#commands/*` and `#utils.ts` syntax
  - Added yargs and @types/yargs dependencies (replacing citty)
  - Configured TypeScript with `allowImportingTsExtensions` and `noEmit` for import map support
  - Updated tsdown config to target node platform explicitly

  All CLI commands maintain their existing behavior and user-facing API.

## 0.13.1

### Patch Changes

- c34d925: Update dependency versions to fix test failures

  **Updated Dependencies:**

  Development dependencies:
  - `@biomejs/biome` from 2.3.8 to 2.3.10
  - `@types/bun` from 1.3.3 to 1.3.5
  - `tsdown` from 0.17.0-beta.4 to 0.18.1
  - `type-fest` from 5.2.0 to 5.3.1

  Peer dependencies:
  - `@biomejs/biome` from 2.3.8 to 2.3.10

  **Internal Changes:**
  - Updated hardcoded `biome.version` in helpers from 2.3.2 to 2.3.10 to match installed package
  - Updated hardcoded `sherif.version` in helpers from 1.7.0 to 1.9.0 to match installed package

  These changes ensure version consistency between hardcoded references in the codebase and actual installed dependencies, resolving test failures that check for version alignment.

- 89f6f83: Add self-referencing dependency and update development tooling

  **New Features:**
  - Added `adamantite` as a dependency to enable dogfooding and self-testing of the package configuration

  **Updated Dependencies:**

  Development dependencies:
  - `sherif` from 1.7.0 to 1.7.1
  - `tsdown` from 0.15.11 to 0.15.12

  This change allows the project to use its own presets and configurations, ensuring consistency and validating that the package works correctly in real-world usage. The development dependency updates bring the latest bug fixes and improvements from upstream packages.

- d354b60: Update development dependencies and Biome peer dependency to latest versions

  **Updated Dependencies:**

  Development dependencies:
  - `@biomejs/biome` from 2.3.2 to 2.3.8
  - `@changesets/cli` from 2.29.7 to 2.29.8
  - `@types/bun` from 1.3.1 to 1.3.3
  - `sherif` from 1.7.1 to 1.9.0
  - `tsdown` from 0.15.12 to 0.17.0-beta.4
  - `type-fest` from 5.1.0 to 5.2.0

  Peer dependencies:
  - `@biomejs/biome` from 2.3.2 to 2.3.8

  Package manager:
  - `bun` from 1.2.20 to 1.3.3

  These updates bring the latest bug fixes, performance improvements, and new features from upstream packages, ensuring the development environment stays current with the latest tooling improvements.

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
