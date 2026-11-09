---
"adamantite": patch
---

Keep a GitHub Actions workflow that the project changed when `init` runs again

`adamantite init --github-actions` rewrote `.github/workflows/adamantite.yml` from the template, so a second run deleted the project's own branches, steps, and runner settings. `init` now rewrites the workflow only when it is still a workflow that Adamantite generated. It keeps any other workflow, including one that runs `adamantite rule test` through a package script, and tells you to run `adamantite doctor` for the updates that the workflow needs.
