---
"adamantite": patch
---

Format before the lint stage in `adamantite fix`, so lint reads the final line breaks

`adamantite fix` now formats, fixes lint issues, and formats again. Before, Oxfmt could wrap a line after the lint stage, and the strict preset's spacing rule then needed a blank line that `fix` had not added, so `check` failed after one `fix`. The first format shows no output. Oxlint still applies one pass of fixes, so a fix that causes a new fixable report needs a second `fix` until Oxlint repeats its passes.
