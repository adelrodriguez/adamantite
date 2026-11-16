---
"adamantite": minor
---

Read the disable comments and the syntax tree from Oxlint

`harden` counts the disable comments that Oxlint itself parses, and `rule ast` prints the syntax tree that Oxlint gives rules. A small internal Oxlint plugin reports them, so both commands run the Oxlint of the project, and `rule ast` now fails when the project has no Oxlint.

`rule ast` prints the tree as Oxlint gives it to rules, with `range`, `comments`, and `tokens` beside `start` and `end`, and without the link from a node to its parent. A `bigint` literal value prints as its digits. A file that Oxlint does not lint, such as a CSS file, fails with an error that says so. When Oxlint cannot read the comments, `harden` asks the agent to count them, as it does when Oxlint cannot list its files.
