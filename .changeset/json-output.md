---
"adamantite": minor
---

Add `--json` to `doctor`, `harden`, `init`, `update`, `rule ast`, and `rule try`, and run `init` from the flags without a terminal

Each command prints one JSON document on standard output and writes its other lines on standard error. With `--json`, a command never asks a question and never starts an agent, and its exit codes stay the same. The Adamantite skill now tells agents to use `--json`.

- `doctor --json` prints the `selection`, the applicable integrations, the `findings` with their `id`, `integration`, `title`, `currentState`, `goal`, `notes`, and `reference`, the `warnings`, and the `packageActions`.
- `harden --json` prints the context of its prompt: the configs, rules folders, instructions, documentation, agent reach, suppressions, override trials, scope, decisions record, and fix history.
- `init --json` and `update --json` print the file writes, the script writes, the installs, and the lockfile write of the setup, and the assessment after it. `init --json` sets up from the flags without `--non-interactive`.
- `rule ast --json` prints the file and its tree, and `rule try --json` prints the rule, the setting, and the reports of each case.

`adamantite init` now asks for the selection only when standard input and standard output are both terminals. Without such a terminal, as in CI or when an agent runs it, `init` sets up from the flags as with `--non-interactive`, and reports a missing `--script` or `--typescript` instead of opening prompts.
