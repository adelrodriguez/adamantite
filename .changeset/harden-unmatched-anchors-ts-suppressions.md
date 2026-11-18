---
"adamantite": minor
---

Report links to missing headings and count TypeScript suppressions in `adamantite harden`

- The "Agent reach" section of the prompt lists each Markdown link to a heading that its file does not have, such as `docs/architecture.md#module-seams`. Adamantite builds each heading's anchor with GitHub's rules: lower case, no punctuation, a hyphen for each space, and `-1`, `-2` for a repeated heading. A `{#id}` at the end of a heading and an HTML `id` count as anchors too. The agent records each such link as a discovery gap, as it does for a link to a missing file.
- After a handoff, `harden` exits 1 when the session added a link to a missing heading. A link that was broken before the session does not fail it.
- The "Suppressions" section counts the `@ts-expect-error`, `@ts-ignore`, and `@ts-nocheck` comments in the files that Oxlint lints, with their locations. It counts a comment only where TypeScript reads the directive, so a sentence that mentions `@ts-ignore` does not count. The prompt tells the agent that many `@ts-expect-error` comments with the same reason point to a type that is wrong at its source.
