---
"adamantite": minor
---

Write the GitHub Actions workflow as one managed file, and remove the managed block

`adamantite init` and `adamantite update` now write `.github/workflows/adamantite.yml` only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. The `# ADAMANTITE:START` and `# ADAMANTITE:END` managed block goes: Adamantite no longer replaces the jobs between the comments of a workflow that you changed, and Doctor no longer reports a malformed block with the `malformed-adamantite-workflow` finding. A workflow that you changed is kept, and `adamantite doctor` reports when no job runs a CI script of the setup, or a job hard-codes a Node.js version. The jobs follow the scripts of the recorded setup.

A workflow that 0.47.0 wrote and nobody changed equals the current render, so the first `adamantite update` records its hash, and a later template change replaces it. A workflow that an earlier release wrote and you renamed stays as it is, and Adamantite writes no second workflow beside it. When the setup no longer names GitHub Actions, `update` deletes the workflow if nobody changed it. A workflow that `init` cannot write now fails `init` instead of leaving a warning.
