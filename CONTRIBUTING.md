# Contributing to Adamantite

Thank you for contributing to Adamantite.

## Requirements

- [Node.js](https://nodejs.org) at the version in `.node-version`.
- [pnpm](https://pnpm.io) 12.0.0-rc.6.
- [Git](https://git-scm.com).

## Set up the repository

1. Fork and clone the repository.
2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Create a branch for the change.

Read [CONTEXT.md](CONTEXT.md) before you change domain behavior. Use
[docs/architecture.md](docs/architecture.md) to find the relevant module boundary.

## Development commands

```sh
pnpm run build       # Bundle the CLI and published presets into dist.
pnpm run dev         # Rebuild when source files change.
pnpm run test        # Run the Vitest suite.
pnpm run test:build  # Build the package and verify the packaged CLI.
pnpm run test:watch  # Rerun tests when files change.
pnpm run check       # Check lint rules and TypeScript types.
pnpm run fix         # Apply safe lint fixes.
pnpm run format      # Format repository files.
pnpm run analyze     # Find unused files, exports, and dependencies.
pnpm run bump:deps   # Select package dependency updates manually.
```

Build the CLI before you run it. The source uses compile-time macros that tsdown expands:

```sh
pnpm run build
node bin/adamantite --help
node bin/adamantite doctor
```

Build and verify the packaged CLI:

```sh
pnpm run test:build
```

## Make a change

- Keep command modules thin and put reusable behavior in `src/lib`.
- Keep integration modules limited to their default integration export. Put shared logic in
  `src/lib/workspace` or `src/lib/shared`.
- Keep one-time legacy transitions in `src/lib/migrations`.
- Do not make `assess` mutate files. `doctor --fix` is the mutating assessment dispatcher.
- Add or update tests for behavior changes. Tests are colocated in `__tests__` directories.
- Update user documentation when CLI behavior, presets, exports, or requirements change.

## Validate a change

Run the full repository workflow before you open a pull request:

```sh
pnpm run test
pnpm run check
pnpm run fix
pnpm run format
```

Dependabot does not yet support pnpm 12. Use `pnpm run bump:deps` for package dependency
updates. Run `pnpm run analyze` after you add or remove dependencies or change imports and
exports. Review all automatic fixes before you commit them.

## Changesets

Add a changeset for a change that affects users of the published package. Examples include
CLI behavior, presets, package exports, runtime dependencies, and documentation included
with the package.

```sh
pnpm exec changeset
```

Do not add a changeset for tests, CI, contributor documentation, release tooling, or other
internal maintenance. Do not create a major changeset unless the breaking change is
intentional and approved.

## Pull requests

A pull request should explain:

- What changed.
- Why the change is needed.
- How the change was validated.
- Whether it changes public behavior or requires migration.

All CI checks must pass before merge. Report bugs and request features through
[GitHub Issues](https://github.com/adelrodriguez/adamantite/issues).
