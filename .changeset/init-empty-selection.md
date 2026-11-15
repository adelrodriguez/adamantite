---
"adamantite": patch
---

Check the recommended scripts in interactive init, and name the init command when a command runs a tool that the setup does not select

The scripts prompt of interactive `adamantite init` now starts with the recommended `check` and `fix` scripts checked, so pressing Enter sets up Oxlint and Oxfmt. Before, it started with nothing checked, and Enter selected no script.

`adamantite check`, `adamantite fix`, and `adamantite analyze` now fail with a `ToolNotSelected` error before they run a tool when the lockfile selects no script that runs the tool of a stage. Setup does not install such a tool, so the error names the command that adds the script and installs the tool, such as `adamantite init --non-interactive --script check`. Before, the commands failed with "`oxlint` is not installed" and "The command `oxfmt` was not found on PATH", and pointed to `adamantite update`, which installs nothing for that selection. With `--only`, the commands check the tool of that stage only. Without a lockfile, or for a selected tool that is not installed, the commands fail as before.
