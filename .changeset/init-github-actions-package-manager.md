---
"adamantite": patch
---

Stop asking about a GitHub Actions workflow in an interactive `init` when Adamantite cannot
generate one for the detected package manager. Before, `init` asked the question and then skipped
the workflow with a warning when the answer was yes. Now it says that the package manager is not
supported and does not ask.
