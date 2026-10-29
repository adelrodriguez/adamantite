---
"adamantite": minor
---

The GitHub Actions workflow that `adamantite init` writes now runs `adamantite rule test` when the project has custom rule tests, so a rule that stops reporting fails CI. `adamantite doctor` reports an Adamantite workflow that does not run `adamantite rule test` when the project has rule tests. Follow the finding to add the step.
