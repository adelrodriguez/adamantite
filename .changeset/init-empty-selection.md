---
"adamantite": patch
---

Check the recommended scripts in interactive init, and name the init command when a tool that the setup does not select is missing

The scripts prompt of interactive `adamantite init` now starts with the recommended `check` and `fix` scripts checked, so pressing Enter sets up Oxlint and Oxfmt. Before, it started with nothing checked, and Enter selected no script.

When Oxlint, Oxfmt, Knip, or Sherif is not installed and the lockfile selects no script that runs it, `adamantite check`, `adamantite fix`, and `adamantite analyze` now fail with a `ToolNotSelected` error. Setup does not install such a tool, so the error names the command that adds the script and installs the tool, such as `adamantite init --non-interactive --script check`. Before, the commands said "`oxlint` is not installed" and "The command `oxfmt` was not found on PATH", and pointed to `adamantite update`, which installs nothing for that selection. A tool that the selection leaves out but that is installed still runs. Without a lockfile, or for a selected tool that is not installed, the commands fail as before.
