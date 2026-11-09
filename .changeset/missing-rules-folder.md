---
"adamantite": patch
---

Report a `custom({ dir })` rules folder that does not exist

When `custom()` names a rules folder that does not exist, it returns an empty config, so Oxlint runs none of the custom rules and `adamantite check` still passes. `adamantite doctor` now reports such a call with the folder and the config file that names it. A `custom()` call without `dir` stays quiet until the project writes its first rule in `.adamantite/lint`.
