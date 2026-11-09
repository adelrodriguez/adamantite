---
"adamantite": patch
---

Keep Sherif in the terminal's process group when `adamantite analyze` runs it

Sherif reads the terminal when `adamantite analyze --fix` asks which version to keep, but it started in a new session, so terminal signals such as Ctrl-C and window resizes did not reach it. Each tool that reads the terminal now starts in Adamantite's process group, as coding agents already did.
