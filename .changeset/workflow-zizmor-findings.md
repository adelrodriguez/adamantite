---
"adamantite": patch
---

Drop the checkout token and keep expressions out of the run script in the generated GitHub Actions workflow

The workflow that `init` and `update` write now sets `persist-credentials: false` on `actions/checkout`, so the job token no longer stays in `.git/config` for the later steps. The run step reads the matrix command from a `COMMAND` environment variable instead of expanding `${{ matrix.command }}` into the shell script. zizmor 1.32.0 now reports no `artipacked` or `template-injection` finding for any package manager. `update` replaces a workflow that the project has not changed. A workflow that the project changed stays as it is.
