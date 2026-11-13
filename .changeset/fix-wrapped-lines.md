---
"adamantite": patch
---

Let one `adamantite fix` add the blank lines that a line Oxfmt wraps needs

`adamantite fix` applies Oxlint fixes, then formats with Oxfmt. Before, Oxfmt could wrap a long one-line binding after the lint stage, and the strict preset's spacing rule then needed a blank line that `fix` had not added, so `check` failed after one `fix`. The spacing rule now counts a line past the print width as multiline, so the lint stage adds that blank line. Oxlint still applies one pass of fixes, so a fix that causes a new fixable report needs a second `fix` until Oxlint repeats its passes.
