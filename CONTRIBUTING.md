# Contributing to Adamantite

Thank you for contributing to Adamantite.

## Requirements

- [Bun](https://bun.sh) 1.3.14 or later.
- [Node.js](https://nodejs.org) 24 or later for Node.js compatibility checks.
- [Git](https://git-scm.com).

## Set up the repository

1. Fork and clone the repository.
2. Install dependencies:

   ```sh
   bun install
   ```

3. Create a branch for the change.

Read [CONTEXT.md](CONTEXT.md) before you change domain behavior. Use
[docs/architecture.md](docs/architecture.md) to find the relevant module boundary.

## Development commands

```sh
bun run build       # Bundle the CLI and published presets into dist.
bun run test        # Run the Bun test suite.
bun run test:watch  # Run tests when files change.
bun run check       # Check lint rules and TypeScript types.
bun run fix         # Apply safe lint fixes.
bun run format      # Format repository files.
bun run analyze     # Find unused files, exports, and dependencies.
```

Run the CLI from source while developing:

```sh
bun run src/index.ts --help
bun run src/index.ts doctor
```

Build before testing the packaged executable:

```sh
bun run build
./bin/adamantite --help
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
bun run test
bun run check
bun run fix
bun run format
```

Run `bun run analyze` after you add or remove dependencies or change imports and exports.
Review all automatic fixes before you commit them.

## Changesets

Add a changeset for a change that affects users of the published package. Examples include
CLI behavior, presets, package exports, runtime dependencies, and documentation included
with the package.

```sh
bunx changeset
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
