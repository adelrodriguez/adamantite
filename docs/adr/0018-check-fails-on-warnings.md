# Check fails on warnings

Coding agents extend the patterns that they read. A rule at `warn` reports a pattern, but
`adamantite check` passed, so an agent could add the pattern again and CI stayed green. Harden
made this worse: it set each new rule to `warn` while existing code broke it, so new code could
break the rule too. We decided (2026-10-29) that `adamantite check` passes `--deny-warnings` to
Oxlint, and that the `--allow-warnings` flag removes it.

Harden now keeps a new rule at `error` and turns it off in an Oxlint override that lists the files
that break it now. New files must follow the rule, and the override is the list of files that a
later change must fix.

The `harden` verification lints as `check` does, so it also fails on warnings. `fix` does not
change: it applies fixes, and `check` is the gate.

## Considered options

- **A baseline file with a count of violations for each file and rule**, as ESLint bulk
  suppressions do. It also stops new violations in a file that already breaks the rule, but
  Oxlint 1.88 has no such feature, so Adamantite would own a new file format. An override uses
  only Oxlint configuration.
- **Keep warnings passing, and deny them only in CI.** The agent then learns about a warning
  only after it pushes.

## Consequences

- A project that has warnings, such as reports of the rules that a preset sets to `warn`, fails
  `check` after the update. The repair is a fix, a suppression with a reason, or
  `--allow-warnings` in the `check` script.
- A file in an override can get more violations of its rule. Review catches those.
- `warn` still shows a different color in an editor, but in `check` it acts as `error`.
