---
"adamantite": minor
---

Remove the Doctor findings for the legacy `format` and monorepo scripts

`adamantite doctor` no longer reports these leftovers of the `format` and `monorepo` commands that v0.41.0 deprecated:

- A `format` script that runs `adamantite format`.
- A `check:monorepo` or `fix:monorepo` script, or a script that starts with `adamantite monorepo`.
- A GitHub Actions step or matrix entry that runs the `format` script with `--check`, a `check:monorepo` or `fix:monorepo` script, or `adamantite monorepo`.

To upgrade a project from v0.40.0 or older, follow the migration notes for v0.41.0 in the changelog. In short, remove those scripts and workflow steps, run `check` and `fix` for formatting, and run `analyze` for Sherif, with custom Sherif flags in the `sherif` field of the root `package.json`.
