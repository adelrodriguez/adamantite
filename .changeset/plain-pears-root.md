---
"adamantite": patch
---

In an npm workspaces monorepo, `adamantite init` now installs the managed devDependencies into the root `package.json` only. Before, npm installed them into every workspace package, and `adamantite analyze` then failed. `adamantite update` now also installs at the workspace root in pnpm and Yarn 1 monorepos, where the package manager refuses a root install without the workspace root flag.
