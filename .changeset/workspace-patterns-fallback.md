---
"adamantite": patch
---

Find the workspace packages that `package.json` declares when `pnpm-workspace.yaml` holds only settings

When `pnpm-workspace.yaml` held only settings, such as `allowBuilds`, Adamantite treated the project as a monorepo but found no workspace packages in it, so Doctor skipped the configs and rules folders of the packages.
