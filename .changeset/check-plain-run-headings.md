---
"adamantite": patch
---

Print the stage headings of `adamantite check` only on a plain run

`adamantite check` and `adamantite check <files>` still print a heading above each stage, such as `🔍 Linting · adamantite (oxlint)`. With `--only` or arguments after `--`, `check` prints only the tool's output, so `adamantite check --only lint -- --format json` prints one JSON document that a script can parse. In a coding agent's shell, where Oxlint prints its agent report, `check` prints no heading either, so a passing lint no longer ends the output with a heading and no result. Adamantite reads the same environment variables as Oxlint 1.94.0 to detect an agent.
