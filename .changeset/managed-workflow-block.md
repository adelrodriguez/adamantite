---
"adamantite": minor
---

Keep the Adamantite job of the GitHub Actions workflow in a managed block

The generated workflow now puts its job between `# ADAMANTITE:START` and `# ADAMANTITE:END` comments. Adamantite owns the jobs between the comments, and the project owns the rest of the workflow. You can rename the workflow file, such as to `checks.yml`, and add your own jobs outside the comments.

- Doctor checks only the jobs in the managed block, in any file in `.github/workflows`.
- Init updates the managed block when you did not change it, and keeps the rest of the file as you wrote it.
- Doctor reports markers that do not make one block, such as a start comment without an end comment, or a managed block in more than one file.
- A `.github/workflows/adamantite.yml` without the comments is still checked as a whole. Init adds the comments when the file is as an earlier release generated it.
