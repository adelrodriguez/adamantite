---
"adamantite": patch
---

Report a managed script that does not run its Adamantite command in Doctor

`adamantite doctor` now compares each selected managed script in the root `package.json` with its command, such as `adamantite check` for `check`. A project could replace the `check` script with another command, and Doctor reported nothing while `pnpm run check` and the generated CI workflow passed without running Adamantite.

Doctor reports the `missing-managed-script` finding for a selected script that `package.json` does not have, and the `mismatched-managed-script` finding for one that runs another command. Both say to run `adamantite update`, which sets the script to its command. If the project still needs the earlier command, move it to a script of another name before the update, and run that script wherever the project ran the managed script, such as in CI.
