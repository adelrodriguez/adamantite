# Benchmarks

`pnpm run bench` times `adamantite check` and `adamantite fix` in a target project for each stack,
along with the direct Oxfmt and Oxlint commands that they run. It builds the package, runs
[`src/lib/bridge/__tests__/index.bench.ts`](../src/lib/bridge/__tests__/index.bench.ts) with
`vitest bench`, and writes the report with
[`scripts/bench-reporter.ts`](../scripts/bench-reporter.ts). The `bench` job of
[`.github/workflows/weekly.yml`](../.github/workflows/weekly.yml) runs it each Monday. No
performance gate reads the results.

```sh
pnpm run bench
```

## Target projects

The bench writes one temporary target project for each stack in `presets/__tests__/stacks.ts`:
`effect`, `jest`, `react`, and `vue`. Each project has the following files:

- The `clean` and `modules` folders of each idiom tree that runs with the stack, in
  `src/<preset>/`. [`SOURCES.md`](../src/__tests__/presets/fixtures/idioms/SOURCES.md) names the
  source and the license of each idiom.
- `oxlint.config.ts` and `oxfmt.config.ts` as `init` renders them for the stack.
- A `tsconfig.json` that extends `adamantite/tsconfig`. In the `effect` stack, it adds the Effect
  language service with the unstable modules that the idioms use.
- `node_modules` with links to the packages of the repository and the fixture packages.
  `node_modules/adamantite` links the files that `package.json` publishes, so the commands run the
  built CLI and the built presets. A project without the `effect` preset has no `@effect/tsgo`.

The bench formats `package.json` and `tsconfig.json` with Oxfmt, as `init` renders formatted
configs, so a fix changes only the fixable idioms.

The report names the number of project files outside `node_modules`, the number of files in the
TypeScript program from `tsc --listFilesOnly`, and the versions of Oxlint, Oxfmt, tsrs, TypeScript,
and `@effect/tsgo`.

## Operations

Each operation is one Vitest test. The tests of a stack run in a random order. The following table
lists the commands of each operation. The bench runs each command in the project folder, with
`node_modules/.bin` first on `PATH` and `NO_COLOR=1`.

| Operation      | Adamantite command                               | Direct command                            |
| -------------- | ------------------------------------------------ | ----------------------------------------- |
| lint one file  | `adamantite check --only lint <file>`            | None                                      |
| lint           | `adamantite check --only lint`                   | `oxlint --deny-warnings`                  |
| format         | `adamantite check --only format`                 | `oxfmt --check`                           |
| check          | `adamantite check`                               | `oxfmt --check && oxlint --deny-warnings` |
| fix then check | `adamantite fix --suggested && adamantite check` | None                                      |

The one file of each stack is ordinary code of its framework, such as `clean/todo-list.tsx` of the
`react` idiom tree. A one-file lint still runs the type check of the whole TypeScript program.

The commands of one operation select the same files with the same binary, native binding,
type-aware backend, rules, folder, variables, and output settings.

The direct `oxlint` command runs only when Adamantite runs Oxlint with the stock native binding.
It gets the variables of the type-aware backend that Adamantite gives Oxlint. In the `effect` stack,
Adamantite loads the native binding of `@effect/tsgo`, so the lint and check operations time no
direct command, and the report names the reason.

Before each timed run of fix then check, the bench writes the `fixable` idioms of the stack into
`src/<preset>/fixable/`. After the run, it compares each file with its `fixed` form and removes the
folder. An idiom that needs a second fix stays out, and the report names it with its upstream issue.

## Validity

A benchmark is valid only when every check below passes. The first run of each command does these
checks before the bench times any run:

- Each process exits with 0.
- Each Oxfmt run names every project file in its output, such as `on 40 files`.
- A JSON lint with the same Oxlint runtime as the command lints every project file except
  `package.json` and `tsconfig.json`, or the one selected file, and reports nothing.
- In a whole-project lint, a canary file with a type error gets exactly one `TS2322` report, which
  shows that the type check ran.
- After fix then check, each fixable idiom equals its `fixed` form.

Each timed run throws when a process exits with another code, and a throw fails the test. The
reporter lists a test as invalid, with the reason and without a timing, when it failed, did not
run, recorded no metadata, or timed a command a number of times other than the planned 20.

## Runs and caches

The bench times 20 runs of each command, after the first run. It sets no warmup. The commands of one
operation run one after the other: all runs of the first command, then all runs of the next.

The bench keeps the operating system file cache, and the caches that the tools keep themselves. It
clears no cache. The first run of a command can find the caches that an earlier operation of the
stack warmed.

## Report

The reporter writes two files to `bench-results/`:

- `report.json` holds the environment, and for each test its metadata and the duration of each run
  in milliseconds.
- `report.md` holds the environment, the invalid benchmarks, and a table for each stack with the
  command, the file counts, the first run, the median, the minimum, the maximum, and the number of
  runs.

The environment is the commit, Node.js, pnpm, the operating system, the CPU, and the memory. A
commit with uncommitted changes says so.

## Limits

- The idioms are short files from a few projects. A real project has more files, other
  dependencies, and other rules, so the timings are not a promise for any project.
- A timing describes one machine. Compare timings only from the same runner type, and treat a
  difference smaller than the spread of the runs as noise.
- The bench does not compare the commands of different operations, stacks, or versions.
- `fix then check` leaves out each idiom that needs a second fix, because Oxlint applies one pass
  of fixes: [oxc#16118](https://github.com/oxc-project/oxc/issues/16118).
