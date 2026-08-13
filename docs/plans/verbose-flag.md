# Plan: verbose flag for full diagnostics

## Goal

Add a `--verbose` flag to the Adamantite CLI. The default error output stays concise but
complete: a summary line plus the trimmed failure reason. The verbose mode adds the full
diagnostic depth that the default output truncates or omits.

## Background

Issue #357 showed that `init` hid the package-manager error. The fix shows the failure
cause by default, with two limits that keep the terminal output readable:

- `formatCauseOutput` in `src/lib/shared/errors.ts` caps multi-line cause output at the
  last 20 lines (`MAX_CAUSE_OUTPUT_LINES`).
- `formatCauseDetail` in the same file keeps only the first line of a cause message.

The verbose flag removes these limits and adds diagnostics that are noise on the default
path. It must not change the default behavior.

## What verbose mode unlocks

1. **Untruncated cause output.** Print the full captured package-manager output, not the
   last 20 lines. Print all lines of a cause message, not the first line.
2. **The full cause chain.** Walk `error.cause` recursively and print each nested cause.
3. **Stack traces.** Print `error.stack` for the failure and its causes.
4. **Defect rendering.** Render unexpected defects with `Cause.pretty` instead of the
   default runtime output.
5. **Command echo.** `CommandRunner` and `DependencyInstaller` log the exact command and
   arguments before each run.

## Design

### Verbosity service

Add a `Verbosity` service in `src/lib/services/verbosity.ts` with a default value of
`false`. Use a `Context.Reference`-style service so consumers do not need explicit
provision in tests. Message getters on error classes stay pure and context-free; they
cannot read a flag. Apply verbosity only at the effect edges:

- The top-level error handler in `src/index.ts`. Default: print `error.message` (current
  behavior). Verbose: catch the full `Cause` (`Effect.catchCause` instead of
  `Effect.catch`) and render it with `Cause.pretty`. `Cause.pretty` natively renders the
  error name and message, cleaned stack traces with span annotations, and the nested
  `error.cause` chain with indentation. Do not hand-roll cause-chain walking or stack
  formatting. If per-line control is needed for the clack gutter, build the output from
  `Cause.prettyErrors` instead, which returns the individual `Error` instances.
- `CommandRunner.run` and `DependencyInstaller.addDevDependencies`. Verbose: log the
  command before execution.

### Flag wiring

- Declare `Flag.boolean("verbose")` on the root command in `src/cli.ts` so the flag
  appears in `--help`. Invocation form: `adamantite --verbose <command>`.
- Also read the raw arguments in `src/index.ts` before CLI parsing and accept
  `--verbose` in any position, including `adamantite <command> --verbose`. Provide the
  `Verbosity` service to the whole program from this scan. The pre-scan is required
  because the top-level error handler runs outside command parsing, and because
  subcommands do not inherit root flags.
- Exclude arguments after the `--` separator from the pre-scan. Those arguments belong
  to the underlying tool (see `runCli` passthrough handling).
- Accept `ADAMANTITE_VERBOSE=1` as an environment fallback for CI, where editing the
  invocation is harder than setting an environment variable.

### Formatting rules

Verbose output goes through the same clack logger as the default output, so every line
keeps the gutter prefix. Reuse the sanitization from `formatCauseOutput` (strip ANSI
codes, treat carriage returns as line breaks, drop blank lines) and export an
untruncated variant instead of duplicating the logic.

## Steps

1. Add the `Verbosity` service with a `false` default.
2. Export an untruncated formatter from `src/lib/shared/errors.ts` that shares the
   sanitization helpers.
3. Add the raw-argument pre-scan and the environment fallback in `src/index.ts`, and
   provide the service.
4. Declare the flag on the root command in `src/cli.ts` for `--help` visibility.
5. Extend the top-level error handler with the verbose rendering path built on
   `Cause.pretty` or `Cause.prettyErrors`.
6. Add command echo to `CommandRunner` and `DependencyInstaller`.
7. Tests: pre-scan positions, `--` exclusion, environment fallback, verbose error
   rendering, unchanged default output.
8. Add a minor changeset and update the README flag documentation.

## Out of scope

- Log levels beyond a boolean (`-v`, `-vv`).
- Verbose output for the underlying tools themselves (oxlint, oxfmt, knip). Passthrough
  arguments after `--` already cover that need.

## Completion

Delete this file when the work is complete.
