---
"adamantite": minor
---

List links whose anchor matches no heading, and count TypeScript suppressions, in `adamantite harden`

- The "Agent reach" section of the prompt lists each Markdown link whose anchor Adamantite could not match to a heading of its file, such as `docs/architecture.md#module-seams`. The match is a simple rule: the GitHub anchor of the heading as written, and of the heading without link targets, HTML tags, and emphasis underscores. A `{#id}` at the end of a heading and an HTML `id` count as anchors too. The rule can list a link that works, such as one to a heading with an image or an HTML entity, so the prompt tells the agent to open each target, decide whether the link is broken, and treat a broken one as a discovery gap. `harden` does not fail a session on such a link.
- The "Suppressions" section counts the `@ts-expect-error`, `@ts-ignore`, and `@ts-nocheck` comments in the files that Oxlint lints, with their locations. It counts a comment only where TypeScript reads the directive, so a sentence that mentions `@ts-ignore` does not count. The prompt tells the agent that many `@ts-expect-error` comments with the same reason point to a type that is wrong at its source.
