---
"adamantite": patch
---

Pin `pnpm/action-setup@v6` in the GitHub Actions workflow that `adamantite init` creates for pnpm projects. Before, the workflow pinned `@v4`, two major versions behind the version that Adamantite's own CI uses. Run `adamantite init` again, or change the version in `.github/workflows/adamantite.yml` by hand, to update an existing workflow.
