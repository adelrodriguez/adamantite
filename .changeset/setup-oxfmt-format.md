---
"adamantite": patch
---

Format the managed files and the lockfile with the project's Oxfmt before `init` and `update` write them

`adamantite init` and `adamantite update` now format each file that they write whole, such as `.vscode/settings.json`, and `.adamantite/adamantite-lock.json` with the Oxfmt that the project installs, and record the hash of the formatted file. They use the project's Oxfmt config, or Adamantite's format preset when the project has none yet. So `adamantite check` passes on these files, and `adamantite fix` leaves them as they are, which keeps their hashes in the lockfile. A project that installs no Oxfmt gets each file as Adamantite renders it. When the project's Oxfmt config does not load, `init` and `update` fail with an error that names the file, before they write it.
