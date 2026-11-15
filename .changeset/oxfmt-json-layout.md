---
"adamantite": patch
---

Write JSON files in the layout that Oxfmt gives them

`adamantite init` and `update` wrote `.adamantite/adamantite-lock.json` with each array item on its own line, so `adamantite check` reported the lockfile that `init` had just written, and `adamantite fix` changed it. Adamantite now writes every JSON file in the layout of the format preset: an array stays on one line when it fits in 100 characters. A JSON file that Adamantite writes, such as the lockfile or `.vscode/settings.json`, now passes `adamantite check` without a `fix`.
