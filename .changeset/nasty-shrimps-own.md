---
"adamantite": patch
---

Improve dependency installation performance by batching packages

Install and update commands now install multiple dependencies in a single package manager call instead of sequentially, reducing total installation time.
