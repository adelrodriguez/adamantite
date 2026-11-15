---
"adamantite": minor
---

Detect the package manager from `package.json` or a lockfile, and drop the `nypm` dependency

Adamantite now reads the package manager from the `packageManager` field of `package.json`, such as `pnpm@10.0.0`, or else from a lockfile: `bun.lock` or `bun.lockb`, `deno.lock`, `package-lock.json`, `pnpm-lock.yaml`, or `yarn.lock`. It looks in the project folder and then in each folder above it. It no longer detects a package manager from `deno.json`, `pnpm-workspace.yaml`, `.yarnrc.yml`, the `devEngines` field, or the command that started Adamantite, and it no longer detects package managers outside bun, deno, npm, pnpm, and yarn. Without a supported package manager, `adamantite init` fails with the `No package manager was found` error, and the GitHub Actions and `AGENTS.md` integrations write no package manager commands. Add a `packageManager` field or a lockfile to the project.

Installs run the package manager directly, such as `pnpm add -D` or `npm install -D`, instead of through Corepack. A failed install shows the command line and what the package manager printed.
