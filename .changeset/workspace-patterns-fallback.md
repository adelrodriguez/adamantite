---
"adamantite": patch
---

Find the workspace packages that `package.json` declares when `pnpm-workspace.yaml` holds only
settings, such as `allowBuilds`. Before, Adamantite treated such a project as a monorepo but found
no workspace packages in it, so Doctor, `harden`, and `rule test` skipped the configs and rules
folders of the packages.
