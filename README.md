<p align="center">
  <h1 align="center">💠 Adamantite</h1>
  <p align="center">
    <strong>Opinionated linting, formatting, type-safety and code quality presets for modern TypeScript applications.</strong>
  </p>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/adamantite">
    <img src="https://img.shields.io/npm/v/adamantite.svg" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/adamantite">
    <img src="https://img.shields.io/npm/dm/adamantite.svg" alt="npm downloads">
  </a>
  <a href="https://github.com/adelrodriguez/adamantite/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/adelrodriguez/adamantite.svg" alt="license">
  </a>
</p>

Adamantite is a collection of presets for
[oxlint](https://oxc.rs/docs/guide/usage/linter.html),
[oxfmt](https://oxc.rs/docs/guide/usage/formatter.html),
[TypeScript](https://www.typescriptlang.org/) and
[sherif](https://github.com/QuiiBz/sherif) that are designed to help humans and agents write
maintainable and scalable type-safe code, both for individual projects and monorepos.

---

## Quick Start

Run the following command on your project to get started:

```shell
npx adamantite init
```

Adamantite will automatically configure your project with linting, formatting, and type-safety rules.

```shell
adamantite check          # Check code for issues and type errors using oxlint
adamantite fix            # Fix code issues using oxlint
adamantite format         # Format code using oxfmt
adamantite monorepo       # Check monorepo for dependency issues using Sherif
adamantite update         # Update Adamantite's dependencies to the latest compatible versions
```

## Features

- **⚡ Fast performance**: Built on oxc's Rust-based architecture for 10-40x faster linting than ESLint
- **🔍 Extensive linting**: 500+ rules covering correctness, performance, security, and accessibility
- **🎯 Zero configuration**: Works out of the box with sensible defaults, no setup required
- **🔧 Single tool solution**: Leverages the oxc ecosystem for linting and formatting
- **🛡️ Strict type safety**: Comes with a strict TypeScript preset to improve type safety across your codebase
- **🏗️ Monorepo support**: Unified configuration and dependency management across workspace packages
- **⚙️ CI-friendly**: Automatically configures GitHub Actions workflows to run checks in CI
- **🤖 AI-friendly patterns**: Consistent code style designed for effective AI collaboration

## Installation

### Automatic Setup (Recommended)

```shell
npx adamantite init
```

This interactive command will:

- Install Adamantite, [oxlint](https://oxc.rs/docs/guide/usage/linter.html), and [oxfmt](https://oxc.rs/docs/guide/usage/formatter.html) as dev dependencies
- Create `oxlint.config.ts` with opinionated presets
- Create `oxfmt.config.ts` with formatting configuration
- Set up `tsconfig.json` with strict TypeScript rules
- Add lint/format scripts to your `package.json`
  - Also adds monorepo-specific scripts if running a monorepo
- Configure editor settings

## 📋 Commands

### `adamantite analyze`

Find unused dependencies, exports, and files using Knip:

```shell
# Analyze the current project
adamantite analyze

# Automatically fix issues, including removing unused files
adamantite analyze --fix

# Enable production and strict analysis
adamantite analyze --strict

# Forward additional arguments to Knip
adamantite analyze -- --directory packages/app
```

### `adamantite check`

Check your code for issues and type errors without automatically fixing them using oxlint:

```shell
# Check all files
adamantite check

# Check specific files
adamantite check src/components/**/*.ts
```

### `adamantite fix`

Fix issues in your code with automatic formatting and safe fixes:

```shell
# Fix all files
adamantite fix

# Fix specific files
adamantite fix src/index.ts

# Apply suggested fixes
adamantite fix --suggested

# Apply dangerous fixes
adamantite fix --dangerous

# Apply all fixes
adamantite fix --all
```

### `adamantite format`

Format your code using oxfmt:

```shell
# Format all files
adamantite format

# Format specific files
adamantite format src/index.ts

# Check if files are formatted without writing
adamantite format --check
```

### `adamantite monorepo`

Special tooling for monorepo projects using [Sherif](https://github.com/QuiiBz/sherif):

```shell
# Check for monorepo-specific issues
adamantite monorepo

# Fix monorepo-specific issues
adamantite monorepo --fix
```

Automatically detects and fixes:

- Inconsistent dependency versions across packages
- Missing dependencies in package.json
- Unused dependencies
- Package.json formatting issues

### Passing arguments to underlying tools

Commands that invoke Knip, Oxlint, Oxfmt, or Sherif can forward additional arguments to
the underlying CLI. Place Adamantite arguments before `--` and underlying CLI arguments
after it:

```shell
adamantite analyze --strict -- --directory packages/app
adamantite check src -- --deny-warnings
adamantite format -- --ignore-path .formatignore
adamantite monorepo -- --ignore-package package-a
```

When invoking a package script, the package manager consumes its own `--`, so add a
second separator for Adamantite:

```shell
bun run analyze -- -- --directory packages/app
npm run analyze -- -- --directory packages/app
```

Passthrough arguments are not supported by `init`, `doctor`, or `update`, because those
commands do not invoke a single underlying CLI.

### `adamantite update`

Run applicable migrations and update Adamantite-managed dependencies:

```shell
# Run migrations and update managed dependencies
adamantite update
```

This also migrates legacy `.oxfmtrc.json(c)` configs to `oxfmt.config.ts` and `knip.json(c)` configs to `knip.config.ts`.

## Presets

### Linting ([presets/lint/](./presets/lint/))

Adamantite provides comprehensive linting rules for TypeScript and JavaScript:

#### Core ([core.ts](./presets/lint/core.ts))

Extensive ruleset covering:

- **Correctness**: Bug prevention and code correctness enforcement
- **Performance**: Optimization patterns and performance best practices
- **Restriction**: Enforcing coding standards and preventing problematic patterns
- **Suspicious**: Detecting code smells and potential bugs
- **Pedantic**: Strict code quality and consistency enforcement
- **Style**: Consistent code formatting and naming conventions
- **Nursery**: Experimental rules under active development

#### Framework Presets

Framework-specific presets are available for:

- **React** ([react.ts](./presets/lint/react.ts)) - React, React-perf, and JSX-a11y rules
- **Next.js** ([nextjs.ts](./presets/lint/nextjs.ts)) - Next.js-specific rules
- **Vue** ([vue.ts](./presets/lint/vue.ts)) - Vue.js rules
- **Node.js** ([node.ts](./presets/lint/node.ts)) - Node.js-specific rules
- **Jest** ([jest.ts](./presets/lint/jest.ts)) - Jest testing rules
- **Vitest** ([vitest.ts](./presets/lint/vitest.ts)) - Vitest testing rules

### Formatting ([format.ts](./presets/format.ts))

Opinionated code formatting with oxfmt, configured for consistency and readability. The published formatter preset is available as `adamantite/format` and is designed to be used from `oxfmt.config.ts`.

### Analyze ([analyze.ts](./presets/analyze.ts))

Opinionated Knip configuration for dependency and unused-file analysis. The published analyze preset is available as `adamantite/analyze` and is designed to be used from `knip.config.ts`.

### TypeScript ([presets/tsconfig.json](./presets/tsconfig.json))

Strict TypeScript configuration for maximum type safety. Catches errors at compile-time that would otherwise cause runtime failures. The preset requires TypeScript 7 or newer.

````

## 🛠️ Development

This project uses Bun for all development tasks:

```shell
# Install dependencies
bun install

# Run tests
bun test

# Build CLI
bun run build

# Linting and type checking
bun run check
````

## 🤝 Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## 📄 License

MIT © [Adel Rodriguez](https://github.com/adelrodriguez)
