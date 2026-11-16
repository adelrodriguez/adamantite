---
"adamantite": minor
---

Remove `--overwrite-scripts`, because `--script` now always sets the selected scripts

`adamantite init --script <name>`, and the scripts that you select in interactive `init`, now set that `package.json` script to its Adamantite command and replace what it ran. `init` no longer keeps a conflicting `check`, `fix`, or `analyze` script, no longer warns about it, and no longer asks whether to replace it, so `--overwrite-scripts` is gone. Drop the flag from scripts and CI that pass it. `init` prints each script that it added or replaced, with the command that it ran before. A script that you did not select stays as it is. To keep custom tool arguments, pass them after `--`, such as `adamantite analyze -- --directory packages/app`, in a script of your own name.

`adamantite update` sets the scripts of the recorded selection the same way, so a selected script that you changed runs its Adamantite command again. When `init` or `update` changes `package.json`, it writes the file in the layout that the project's Oxfmt gives it, so `adamantite fix` leaves it unchanged. `init` and `update` now install `adamantite` itself at the version that runs them, in the same install as the tools, when the project does not depend on it.
