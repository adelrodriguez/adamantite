---
"adamantite": minor
---

Use Effect's prompts and console for the terminal, and exit 1 when `init` is cancelled

Questions now show `? message ›`, and each answer shows `✔ message … answer`. Status lines start with a symbol, such as `✔ Dependencies installed.`, and no guide line runs at the left edge. Each step prints one line when it finishes, without a spinner. The error that ends a command goes to standard error.

- The intro and outro headings print only when the command can prompt, so a run without a terminal, or `init --non-interactive`, prints none. Each outro starts with `✅`, such as `✅ Setup finished.` and `✅ No setup selected, so Adamantite made no changes.`. `adamantite update` no longer prints the `❌ Update failed` outro before an error.
- A cancelled prompt in `adamantite init`, such as Ctrl-C, now exits 1 with the `CommandFailed` error, as a cancel in `doctor`, `harden`, and `update` does. Before, `init` printed `■ Setup was cancelled.` and exited 0. A script that runs `init` in a terminal and treats a cancel as success needs to accept exit code 1.
- The scripts prompt of interactive `init` starts with the recommended `check` and `fix` scripts checked, so pressing Enter sets up Oxlint and Oxfmt. Before, Enter selected no script.
- The editor prompt of `init` calls the `.vscode/settings.json` choice "Universal", because VS Code, Cursor, Windsurf, and other editors read that file. The highlighted choice shows the settings file that `init` creates. The `--editor vscode` flag does not change.
