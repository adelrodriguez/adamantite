---
"adamantite": patch
---

Name the `init` command that adds a tool when the setup does not select it

When Oxlint, Oxfmt, Knip, or Sherif is not installed and the lockfile selects no script that runs it, `adamantite check`, `adamantite fix`, and `adamantite analyze` now fail with a `ToolNotSelected` error. Setup does not install such a tool, so the error names the command that adds the script and installs the tool, such as `adamantite init --non-interactive --script check`. Before, the commands said "`oxlint` is not installed" or "The command `oxfmt` was not found on PATH", and pointed to `adamantite update`, which installs nothing for that selection. A tool that the selection leaves out but that is installed still runs. Without a lockfile, or for a selected tool that is not installed, the commands fail as before.
