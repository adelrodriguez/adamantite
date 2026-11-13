---
"adamantite": patch
---

Let one `adamantite fix` leave code that `adamantite check` accepts

Oxlint applies one pass of fixes, and the strict preset's spacing rule reads the line breaks that Oxfmt writes. One fix could then leave a missing blank line, for example after Oxfmt wrapped a long binding or after `no-else-return` moved a statement, and `check` failed until a second `fix`. `fix` now runs Oxlint and Oxfmt in two rounds. The first round shows no output, and the second round shows the reports that remain. `--only` still runs one stage once.
