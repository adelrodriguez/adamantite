---
"adamantite": patch
---

Exit 1 when `adamantite init` is cancelled, and end `init` with the outro symbol of the other commands

A cancelled prompt in `adamantite init`, such as Ctrl-C, now exits 1 with the `CommandFailed` error, as a cancel in `doctor`, `harden`, and `update` does. Before, `init` printed `■ Setup was cancelled.` and exited 0. A script that runs `init` in a terminal and treats a cancel as success needs to accept exit code 1.

The `init` outros now start with `✅`, such as `✅ Setup finished.` and `✅ No setup selected, so Adamantite made no changes.`, instead of `💠`. `adamantite update` no longer prints the `❌ Update failed` outro before an error. The error line on standard error still names the failure.
