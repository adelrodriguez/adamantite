---
"adamantite": patch
---

Set up from the flags when `adamantite init` runs without a terminal that can prompt

`adamantite init` asks for the selection only when standard input and standard output are both terminals. Without such a terminal, as in CI or when an agent runs it, init now sets up from the flags as with `--non-interactive`, and reports a missing `--script` or `--typescript` instead of opening prompts.
