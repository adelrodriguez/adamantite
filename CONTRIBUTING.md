# Contributing to Adamantite

Thank you for contributing to Adamantite.

## Requirements

- [Node.js](https://nodejs.org) at the version in `.node-version`.
- [pnpm](https://pnpm.io) at the version in `packageManager` in `package.json`.
- [Git](https://git-scm.com).

## Set up the repository

1. Fork and clone the repository.
2. Install dependencies:

   ```sh
   pnpm install
   ```

3. Create a branch for the change.

Read [GLOSSARY.md](GLOSSARY.md) before you change domain behavior. Use
[docs/architecture.md](docs/architecture.md) to find the relevant module boundary.
Read [CODING_STANDARDS.md](CODING_STANDARDS.md) for coding choices that require review, and
[DESIGN.md](DESIGN.md) before changing terminal output or interaction.

## Development commands

```sh
pnpm run build         # Bundle the CLI and published presets into dist.
pnpm run build:missing # Build only when dist has no build.
pnpm run dev           # Rebuild when source files change.
pnpm run test          # Run the Vitest suite: the unit and presets projects.
pnpm run test:unit     # Run only the tests that start no process.
pnpm run test:presets  # Run only the tests that start real processes, such as Oxlint.
pnpm run test:build    # Verify the built package and CLI.
pnpm run test:watch    # Rerun tests when files change.
pnpm run check         # Check formatting, lint rules, and TypeScript types with the built CLI.
pnpm run fix           # Apply safe lint fixes and format files with the built CLI.
pnpm run analyze       # Find unused files, exports, and dependencies.
pnpm run bench         # Time check and fix in a target project of each stack.
pnpm run bump:deps     # Select package dependency updates manually.
```

Build the CLI before you run it. The source uses compile-time macros that tsdown expands:

```sh
pnpm run build
node bin/adamantite --help
node bin/adamantite doctor
```

`check` and `fix` run `build:missing` first, so they build the CLI only when `dist` has no build.
After you change the CLI, run `pnpm run build`, or keep `pnpm run dev` running, so that they run
your change.

Build and verify the packaged CLI:

```sh
pnpm run test:build
```

## Make a change

- Add or update tests for behavior changes, in the folder that [Place a test](#place-a-test)
  names.
- Update user documentation when CLI behavior, presets, exports, or requirements change.

## Place a test

Each kind of test has one place:

- Stack and fixture tests go in `presets/__tests__/`. They lint the rule fixtures in
  `src/__tests__/presets/fixtures/` with real Oxlint. The fixtures stay below `src/`, because below
  `presets/` the published `presets/tsconfig.json` would include them, and the Oxlint type check of
  `presets/analyze.ts` reports each file of that project, also a file that `ignorePatterns`
  ignores.
- RuleTester tests of a first-party rule go in
  `presets/lint/plugins/<plugin>/__tests__/<rule>.test.ts`. Tests of the helpers that several
  plugins share go in `presets/lint/plugins/shared/__tests__/`.
- Tests of the `custom()` helpers and the authoring API go in `presets/rules/__tests__/`.
  `presets/__tests__/custom.test.ts` lints projects that call `custom()` in real Oxlint runs.
- Command-behavior tests go in `src/commands/__tests__/`. They run a command against an in-memory
  project with `runCommand` in `src/__tests__/command-test-helpers.ts`.
- The tests of one integration go in `src/lib/integrations/<name>/__tests__/index.test.ts`, also
  the tests that run `init`, `update`, and `doctor` through `runLifecycle` in
  `src/__tests__/lifecycle.ts`.
- A test of one `src` module goes in the `__tests__` folder beside it. The helpers that tests in
  several folders share go in `src/__tests__/`.
- Tests of a script in `scripts/` go in `scripts/__tests__/<script>.test.ts`.
- Benchmarks go in a `<name>.bench.ts` file beside the test of the module that they time, such as
  `src/lib/bridge/__tests__/index.bench.ts`.

Name each test file after the module that it tests, as `<folder>/__tests__/<name>.test.ts` for
`<folder>/<name>.ts`, or list it with a reason in `src/__tests__/test-names.test.ts`.

A test file with a test that starts a real process, such as Oxlint, Oxfmt, Node.js, or Vitest,
belongs in the `PROCESS_RUN_TESTS` list of `config/tests.ts`. Keep that test in the file of its
module, beside the unit tests, which then run with it. That list is the `presets` Vitest project,
which `pnpm run test:presets` runs. Every other test file runs in the `unit` project, which must not
touch the host filesystem. `pnpm run check` reports a unit test that imports a host layer, or a
`node:fs` function that does more than read the repository.

## Validate a change

Run the full repository workflow before you open a pull request:

```sh
pnpm run test
pnpm run check
pnpm run fix
```

The first-party rules and the probe plugin must work with each Oxlint version that
`peerDependencies` allows. CI runs the RuleTester tests, the preset fixtures of every stack, and the
probe tests with the minimum version. To do
that locally, install the version from `peerDependencies.oxlint` in a temporary folder, and name
its package folder in `ADAMANTITE_TEST_OXLINT`:

```sh
npm install --prefix /tmp/minimum-oxlint oxlint@<minimum version>
ADAMANTITE_TEST_OXLINT=/tmp/minimum-oxlint/node_modules/oxlint pnpm exec vitest run \
  presets/lint/plugins presets/__tests__/stacks.test.ts presets/__tests__/strict.test.ts \
  presets/__tests__/effect.test.ts src/commands/__tests__/rule.test.ts \
  src/lib/hardening/__tests__/suppressions.test.ts
```

A fixture that imports a package, such as `vue`, needs the package in the fixture packages, not in
the root `package.json`. Add it with an exact version, and commit the lockfile of the fixture
packages:

```sh
pnpm --dir presets/__tests__/fixture-packages add -E vue@<version>
```

Dependabot does not yet support pnpm 12. Use `pnpm run bump:deps` for package dependency
updates. Run `pnpm run analyze` after you add or remove dependencies or change imports and
exports. Review all automatic fixes before you commit them.

### Test the presets with the newest versions

Each Monday, the `latest` job of the `weekly` workflow runs `pnpm run test:presets` with the
locked versions and then with the newest versions of Oxlint, the managed plugins, the type-aware
backend, and the packages that the fixtures import. When the newest versions fail, the workflow opens an issue
with the `automated` label, or comments on the open issue that has the same failure. The script
works in a temporary worktree of `HEAD`, so it changes no file of your checkout. To run it
locally, name a folder for the report:

```sh
node scripts/test-latest.ts run --out /tmp/latest
```

To test a chosen version instead of the newest, add `--override <package>@<version>`. A manual
run of the workflow takes the same values in its `overrides` input.

### Time the toolchain

Run the benchmarks after a change that can slow `adamantite check` or `adamantite fix`, such as a
change to the CLI startup, the Oxlint entry, or a preset:

1. Close other programs that use the CPU.
2. Run `pnpm run bench`.
3. Read `bench-results/report.md`. It lists each invalid benchmark with its reason.
4. Compare the medians with a run on `main` from the same machine.

Each Monday, the `bench` job of the `weekly` workflow runs the same command and uploads the
report. [docs/benchmarks.md](docs/benchmarks.md) describes what the bench measures and when a
benchmark is valid.

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
