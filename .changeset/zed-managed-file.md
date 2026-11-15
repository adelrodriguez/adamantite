---
"adamantite": minor
---

Write `.zed/settings.json` as a managed file

`adamantite init` and `adamantite update` now write `.zed/settings.json` only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. They no longer merge Adamantite's settings into your settings, and no longer stop or print a change to make by hand when the file has comments. A file that you changed is kept, and `adamantite doctor` reports a missing Oxlint entry and a missing Effect language server. Settings that an earlier version wrote and nobody changed are replaced with the current version, and `update` deletes them when the setup no longer names Zed.

The Effect editor messages now say to run `adamantite update` instead of an `adamantite init` command. Zed reads `auto_install_extensions` only from the user settings, so `init` still prints the link of each Zed extension.
