---
"adamantite": patch
---

Run the format and lint stages of `adamantite check` at the same time

`adamantite check` now starts Oxfmt and Oxlint together, so a check takes about as long as its lint stage. The output keeps its order: the Oxfmt section prints first, and the Oxlint section prints after Oxfmt ends. Each stage writes to a pipe, and Adamantite sets `FORCE_COLOR` for both when the terminal shows color. `check --only format` and `check --only lint` run as before.
