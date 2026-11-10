---
"adamantite": patch
---

Ask about a GitHub Actions workflow in `init` only when Adamantite can write one

An interactive `init` asked the question for every package manager, and then skipped the workflow with a warning when the answer was yes and Adamantite could not generate a workflow for the detected package manager. Now it says that the package manager is not supported and does not ask.
