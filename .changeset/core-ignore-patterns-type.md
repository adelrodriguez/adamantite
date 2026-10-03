---
"adamantite": patch
---

Type `ignorePatterns` on the core lint preset as `string[]`, not `string[] | undefined`, so projects can spread `core.ignorePatterns` into their own patterns
