---
"adamantite": minor
---

Replace the GitHub Actions jobs between the `# ADAMANTITE:START` and `# ADAMANTITE:END` comments on each `adamantite init`

Before, `init` kept the jobs between the comments when they were not the same as the current template. After a template change, `init` also kept the jobs that an earlier release wrote, so the workflow did not get the change. Now `init` writes the current jobs between the comments each time, also when you changed them. The rest of the workflow stays as you wrote it.

`init` no longer adds the comments to a `.github/workflows/adamantite.yml` without them, also when an earlier release wrote the file. Adamantite cannot tell its jobs from yours in that file, so `init` keeps it, and `adamantite doctor` reports it with a request to add the comments.

To keep a change that you made between the comments:

1. Move the job or step to a job of your own, outside the comments.
2. Run `adamantite init` again. The jobs between the comments become the current ones, and your job stays.

To update a workflow without the comments:

1. Put the jobs that run the Adamantite scripts between one `# ADAMANTITE:START` comment and one `# ADAMANTITE:END` comment.
2. Run `adamantite init` again.
