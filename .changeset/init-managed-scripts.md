---
"adamantite": patch
---

Write `AGENTS.md` and the CI workflow for every script that `package.json` manages

When `adamantite init` ran again with fewer `--script` flags, it rewrote the Adamantite section of `AGENTS.md` and the workflow matrix without the scripts from earlier runs, although `package.json` still had them. Both now list every script that runs an Adamantite command. A conflicting script that `init` kept, such as `"check": "eslint ."`, is no longer listed, because it does not run Adamantite. When no CI script runs Adamantite, `init` writes no workflow and says so.
