---
"adamantite": patch
---

Accept a server action that has no `await` in the nextjs preset

The nextjs lint preset now turns off the core rule `typescript/require-await`. Next.js rejects each exported function of a `"use server"` file that is not async, so the rule reported a server action that the user could not change. An Oxlint override selects files by path and cannot select a file by its `"use server"` directive, so the rule is off in all files of a project with the nextjs preset.
