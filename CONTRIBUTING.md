# Contributing to Adamantite

Thanks for your interest in contributing to Adamantite! This guide will help you get started with contributing to the project.

## 🚀 Getting Started

### Prerequisites

- [Bun](https://bun.sh/) 1.2.20 or later
- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18+ (for compatibility testing)

### Setting Up Your Development Environment

1. Fork the repository on GitHub
2. Clone your fork locally:

   ```bash
   git clone https://github.com/YOUR_USERNAME/adamantite.git
   cd adamantite
   ```

3. Install dependencies:

   ```bash
   bun install
   ```

4. Create a new branch for your feature or fix:
   ```bash
   git checkout -b feature/your-feature-name
   ```

## 🛠️ Development Workflow

### Available Scripts

- `bun run build` - Build the CLI tool
- `bun run dev` - Build in watch mode for development
- `bun test` - Run all tests
- `bun run test:watch` - Run tests in watch mode
- `bun run check` - Check for code issues using oxlint
- `bun run fix` - Auto-fix code issues using oxlint
- `bun run format` - Format code using oxfmt
- `bun run typecheck` - Run TypeScript type checking using tsc

### Making Changes

1. **Before coding**: Run tests to ensure everything works:

   ```bash
   bun test
   ```

2. **During development**: Use watch mode for continuous feedback:

   ```bash
   bun run dev        # For building
   bun run test:watch # For testing
   ```

3. **Before committing**: Ensure code quality:
   ```bash
   bun run check
   bun run fix
   bun run format
   bun run typecheck
   bun test
   ```

## 🧪 Testing

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun run test:watch

# Run specific test file
bun test src/__tests__/index.test.ts
```

### Writing Tests

- Place test files in colocated `src/**/__tests__/` directories
- Use descriptive test names that explain the behavior being tested
- Follow the existing test patterns in the codebase
- Test both success and error cases

Example test structure:

```typescript
import { test, expect, describe } from "bun:test"

describe("feature name", () => {
  test("should do something specific", () => {
    // Arrange
    const input = "test input"

    // Act
    const result = yourFunction(input)

    // Assert
    expect(result).toBe("expected output")
  })
})
```

## 📝 Code Standards

### Code Style

- We use [oxc](https://oxc.rs/) (oxlint and oxfmt) for linting and formatting
- Code is automatically formatted on commit
- Follow TypeScript strict mode requirements
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Commit Messages

Use conventional commit format:

- `feat: add new CLI command for updating dependencies`
- `fix: resolve issue with monorepo detection`
- `docs: update README with new configuration options`
- `refactor: simplify command parsing logic`
- `test: add tests for init command`

## 🔄 Pull Request Process

### Before Submitting

1. Ensure all tests pass: `bun test`
2. Check for issues: `bun run check`
3. Auto-fix issues: `bun run fix`
4. Format code: `bun run format`
5. Run type checking: `bun run typecheck`
6. **Add a changeset**: Run `bunx changeset` to document your changes
7. Update documentation if needed
8. Add tests for new features

### Submitting Your PR

1. Push your branch to your fork
2. Create a pull request against the `main` branch
3. Fill out the PR template with:
   - Description of changes
   - Why the change is needed
   - How to test the changes
   - Any breaking changes

### PR Review Process

- All PRs require at least one review
- CI checks must pass (linting, type checking, tests)
- Maintainers may request changes or ask questions
- Once approved, maintainers will merge your PR

## 🐛 Reporting Issues

### Bug Reports

When reporting bugs, please include:

- Adamantite version (`npx adamantite --version`)
- Operating system and version
- Node.js/Bun version
- Minimal reproduction steps
- Expected vs actual behavior
- Error messages or logs

### Feature Requests

For new features:

- Describe the problem you're solving
- Explain your proposed solution
- Consider how it fits with existing functionality
- Provide examples of usage

## 📦 Release Process

Adamantite uses [changesets](https://github.com/changesets/changesets) for version management:

1. **Adding a changeset**: Run `bunx changeset` after making changes
2. **Version bumping**: Maintainers run `bun run version`
3. **Publishing**: Automated via GitHub Actions on merge to main

### Types of Changes

- **patch**: Bug fixes, minor improvements
- **minor**: New features, backwards compatible
- **major**: Breaking changes

## 💡 Development Tips

### Working with the CLI

Test your CLI changes locally:

```bash
# Build the CLI
bun run build

# Test commands locally
./bin/adamantite --help
./bin/adamantite init --help
```

### Debugging

- Use `console.log` for quick debugging
- Bun has built-in debugging support
- Add `debugger` statements for breakpoints

### Project Structure

```
src/
├── commands/          # CLI command implementations
├── helpers/           # Helper modules (packages, editors, CI)
├── index.ts          # Main CLI entry point
├── types.ts          # TypeScript type definitions
├── utils.ts          # Shared utilities
└── version.ts        # Version information
presets/
├── oxlint/           # oxlint configuration presets
├── oxfmt.json        # oxfmt configuration preset
└── tsconfig.json     # TypeScript configuration preset
```

## 📞 Getting Help

- **Discussions**: Use GitHub Discussions for questions
- **Issues**: Report bugs or request features via GitHub Issues
- **Email**: Contact the maintainer at hello@adelrodriguez.com

## 🤝 Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help others learn and grow
- Follow the Golden Rule

---

Thank you for contributing to Adamantite! Your contributions help make TypeScript development better for everyone. 🚀
