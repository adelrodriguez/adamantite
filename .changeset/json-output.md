---
"adamantite": minor
---

Add `--json` to `doctor`, `harden`, `init`, `update`, `rule ast`, and `rule try`

Each command prints one JSON document on standard output and writes its other lines on standard error. With `--json`, a command never asks a question and never starts an agent, and its exit codes stay the same. `doctor --json` prints the `selection`, the applicable integrations, the `findings` with their `id`, `integration`, `title`, `currentState`, `goal`, `notes`, and `reference`, the `warnings`, and the `packageActions`. `harden --json` prints the context of its prompt: the configs, rules folders, instructions, documentation, agent reach, suppressions, override trials, scope, and commits. `init --json` and `update --json` print the file writes, the script writes, the installs, and the lockfile write of the setup, and the assessment after it. `init --json` sets up from the flags without `--non-interactive`. `rule ast --json` prints the file and its tree, and `rule try --json` prints the rule, the setting, and the reports of each case. The Adamantite skill now tells agents to use `--json`.

The intro and outro headings now print only when the command can prompt, so a run without a terminal, or `init --non-interactive`, prints none.
