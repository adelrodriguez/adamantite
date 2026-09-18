---
"adamantite": minor
---

`adamantite doctor` now reports what remains of the legacy monorepo scripts. Sherif reports
a `check:monorepo` or `fix:monorepo` script and any script whose command starts with
`adamantite monorepo`. The finding tells you to move custom Sherif flags into the `sherif`
field of the root `package.json` and to remove the script. When the project has no managed
`analyze` script, the finding also tells you to adopt `analyze`. The GitHub integration
reports a workflow step that runs `check:monorepo` or `adamantite monorepo`.
