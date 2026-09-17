---
"adamantite": minor
---

Doctor now reports the legacy managed `format` script and a GitHub Actions workflow step that runs the `format` script with `--check`. Remove both: `check` verifies formatting and `fix` applies it. Also remove the `format` line from the Adamantite section of `AGENTS.md`; doctor does not assess that file.
