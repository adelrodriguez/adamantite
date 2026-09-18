---
"adamantite": minor
---

Deprecate `adamantite monorepo`. The command still runs Sherif, and it now prints a warning
with the exact replacement, for example `adamantite analyze --only monorepo --fix`. The
next release removes the command. Use `adamantite analyze`, which runs Sherif in a detected
monorepo. `analyze` runs Sherif without flags, so move custom Sherif flags into the `sherif`
field of the root `package.json`. Run `adamantite doctor` for the steps.
