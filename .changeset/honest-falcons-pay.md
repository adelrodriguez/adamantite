---
"adamantite": patch
---

Replace `default-case` rule with smarter `switch-exhaustiveness-check` configuration. Switches on union types now require either all members to be handled or a `default` case, and non-union switches require a `default`.
