# The type-aware rules run on tsrs

ADR 0022 renames the narrow toolchain to Oxlint runtime and changes the module ownership.
The names and paths below describe this decision when it was made.

Oxlint runs its type-aware rules in a separate backend process. Until now, that backend was
oxlint-tsgolint, which is built on typescript-go. [tsrs](https://github.com/oxc-project/tsrs), a
Rust port of the TypeScript 7 compiler, ships `tsrs --lint` since 0.21.0. It implements the
headless protocol and the type-aware rules of tsgolint 7.0.2005. `@effect/tsgo` 0.67.0 and later
ship an Effect build of tsrs with the `effecttsgo` rules. We decided (2026-11-05, issue #617)
that Adamantite runs the type-aware rules on tsrs, for projects with and without the `effect`
preset, and stops installing oxlint-tsgolint.

## The backend

The toolchain from ADR 0019 now gives the backend as the variables that make Oxlint start tsrs.
Oxlint does not find tsrs by itself, so every project with tsrs gets a variable:

- A project that installs `@effect/tsgo` gets `EFFECT_TSGO_TSGOLINT_PATH`, set to the Effect
  build of the installed tsrs version from `artifacts/tsrs/<version>/` of the platform package,
  and `EFFECT_TSGO_TSGOLINT_MODE=tsrs`. The Effect binding then starts the backend as
  `<path> --lint headless`.
- Every other project gets `OXLINT_TSGOLINT_PATH`, set to the `tsrs-lint` bin of the installed
  `tsrs` package. Oxlint starts the backend as `<path> headless`, and `tsrs-lint` adds the
  `--lint` flag. Windows cannot start that Node script, so it gets the launcher that the package
  manager writes: `tsrs-lint.cmd` from npm and pnpm, or `tsrs-lint.exe` from Bun. The entry takes
  the nearest launcher in a `node_modules/.bin` folder from the project up, as Oxlint looks for
  its own backend, so a workspace package can use the launcher of the root installation.
- A project without tsrs gets no variable, so Oxlint runs as it is installed and fails only when
  it runs a type-aware rule. Doctor reports the missing package.

The entry `src/oxlint.ts` copies the variables into its environment before it imports Oxlint. The
Effect plugin owns the names of the Effect variables, in `plugins/effect-tsgo/toolchain.ts`.

## The package

The `tsrs` integration in `tooling/oxlint/tsrs.ts` replaces the oxlint-tsgolint integration.
`init` and `update` install the pinned `tsrs`, and Doctor reports an `oxlint-tsgolint`
dependency that the project still lists. The pinned `tsrs` must be a version that the pinned
`@effect/tsgo` ships an Effect build of. `src/__tests__/presets/effect.test.ts` checks the pinned
Oxlint and tsrs versions against the platform package.

`tsrs` is an optional peer dependency of Adamantite, because the entry starts it from the project.
Knip counts a peer of a used package as used, so the analyze preset does not report `tsrs` as an
unused devDependency.

## Considered options

- **Run `effect-tsgo --tsrs-lint oxlint` in place of the entry.** The upstream proxy now replaces
  only the Oxlint binding, and it runs on this repository. But editors need one `.js` path that
  takes `--lsp`, and the upstream command needs its subcommand and flag in front.
- **Move only the projects without the `effect` preset.** This repository uses the preset, so its
  own `check` could not test the move, and the oxlint-tsgolint integration would stay.

## Consequences

- On this repository, the full lint took 2.34 to 2.47 s on tsrs and 4.18 to 4.24 s on tsgolint,
  over 3 runs each, with `@effect/tsgo` 0.67.1 on one Linux x64 machine with 4 CPUs.
- tsrs 0.21.0 ports TypeScript 7.1 beta, and the project can pin TypeScript 7.0. The type check
  in Oxlint can then differ from `tsc`.
- tsrs does not support the Go profiling variables of tsgolint, such as `OXLINT_TSGOLINT_CPU`.
- The packaged Effect builds do not run on Linux with musl. The stock `tsrs` package has musl
  builds.
- The type-aware rules do not run on Windows ARM64. tsrs 0.21.0 publishes no `@tsrs/win32-arm64`
  package, so `tsrs-lint` fails with "This platform is not supported". `@effect/tsgo` 0.67.1 ships
  no tsrs build for Windows ARM64, so the `effect` preset fails with `EffectBuildMissing`.
  oxlint-tsgolint did support Windows ARM64. We accepted this gap (2026-11-05, PR #620) and wait
  for the upstream fix. [oxc-project/tsrs#903](https://github.com/oxc-project/tsrs/pull/903) adds
  the package, and no published tsrs release includes it yet. Remove this note when the pinned
  `tsrs` and `@effect/tsgo` both ship Windows ARM64 builds.
- When Oxlint finds tsrs by itself, the backend of a project without the `effect` preset needs no
  variable.
