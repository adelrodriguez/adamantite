---
"adamantite": minor
---

`adamantite init` now installs the Adamantite skill for the coding agents that you select. The interactive setup selects the agents whose CLI is installed, and `--skill-agent <agent>` selects them in non-interactive mode. Init runs the `skills` CLI with `npx` and copies the skill from `node_modules/adamantite`, so the skill matches the installed Adamantite version. `adamantite update` copies the skill again when it differs from the skill in the installed package.
