<p align="center">
  <img src="https://github.com/adelrodriguez/adamantite/raw/main/.github/assets/logo.svg" alt="Adamantite" width="120" height="120">
  <h1 align="center">💠 Adamantite</h1>
  <p align="center">
    <em><strong>Bulletproof your code.</strong></em>
  </p>
  <p align="center">
    Opinionated linting, formatting, and type-safety presets for modern TypeScript applications.<br>
    Designed for humans and AI.
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

---

## Quick Start

Run the following command on your project to get started:

```shell
npx adamantite init
```

Adamantite will automatically configure your project with linting, formatting, and type-safety rules.

## Features

- **⚡ Fast performance**: Built on Biome's Rust-based architecture for efficient linting and formatting
- **🔍 Extensive linting**: 200+ rules covering correctness, performance, security, and accessibility
- **🎯 Zero configuration**: Works out of the box with sensible defaults, no setup required
- **🔧 Single tool solution**: Replaces ESLint + Prettier + multiple config files with one unified approach
- **🛡️ Strict type safety**: Comes with a strict TypeScript preset to improve type safety across your codebase
- **🏗️ Monorepo support**: Unified configuration and dependency management across workspace packages
- **🤖 AI-friendly patterns**: Consistent code style designed for effective AI collaboration

## Installation

### Automatic Setup (Recommended)

```shell
npx adamantite init
```

This interactive command will:

- Install Adamantite and [Biome](https://biomejs.dev/) as dev dependencies
- Create `biome.jsonc` with opinionated presets
- Set up `tsconfig.json` with strict TypeScript rules
- Add lint/format scripts to your `package.json`
- Configure editor settings (VSCode/Cursor/Windsurf)
- Install [Sherif](https://github.com/QuiiBz/sherif) for monorepo support

### Manual Setup

If you prefer manual configuration:

```shell
# Install dependencies
npm install --save-dev adamantite @biomejs/biome

# Extend the Biome configuration
echo '{ "extends": ["adamantite"] }' > biome.jsonc

# Extend TypeScript configuration
echo '{ "extends": "adamantite/presets/tsconfig.json" }' > tsconfig.json
```

## 📋 Commands

Adamantite provides a comprehensive CLI for all your code quality needs:

### `adamantite lint`

Lint and automatically fix issues in your codebase:

```shell
# Lint all files
adamantite lint

# Lint specific files
adamantite lint src/components/**/*.ts

# Show summary of results
adamantite lint --summary
```

### `adamantite format`

Format your code with consistent style:

```shell
# Format all files
adamantite format

# Format specific files
adamantite format src/utils.ts

# Apply unsafe formatting fixes
adamantite format --unsafe
```

### `adamantite ci`

Run in continuous integration environments:

```shell
# Basic CI check
adamantite ci

# With GitHub reporter (for PR comments)
adamantite ci --github

# Include monorepo checks
adamantite ci --monorepo
```

### `adamantite monorepo`

Special tooling for monorepo projects using [Sherif](https://github.com/QuiiBz/sherif):

```shell
# Lint and fix monorepo-specific issues
adamantite monorepo
```

Automatically detects and fixes:

- Inconsistent dependency versions across packages
- Missing dependencies in package.json
- Unused dependencies
- Package.json formatting issues

### `adamantite update`

Keep your dependencies current:

```shell
# Update to latest compatible versions
adamantite update
```

## Presets

### Biome Configuration ([biome.jsonc](./biome.jsonc))

Adamantite's Biome preset includes:

- **Formatting**: 2-space indentation, 80-character line width, LF line endings
- **Import Organization**: Automatic import sorting with custom groups (Bun → Node → Packages → Aliases)
- **Linting Rules**: 200+ rules covering:
  - Code correctness and bug prevention
  - Performance optimizations
  - Security best practices
  - Accessibility guidelines
  - React/JSX patterns
- **File Patterns**: Pre-configured for TypeScript, JavaScript, JSON, and more

### TypeScript Configuration ([presets/tsconfig.json](./presets/tsconfig.json))

The TypeScript preset includes strict settings for maximum type safety:

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "forceConsistentCasingInFileNames": true,
    "noImplicitReturns": true,
    "verbatimModuleSyntax": true
  }
}
```

These settings catch errors at compile-time that would otherwise cause runtime failures.

## 🛠️ Development

This project uses Bun for all development tasks:

```shell
# Install dependencies
bun install

# Run tests
bun test

# Build CLI
bun run build

# Type checking
bun run typecheck
```

## 🤝 Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) first.

## 📄 License

MIT © [Adel Rodriguez](https://github.com/adelrodriguez)
