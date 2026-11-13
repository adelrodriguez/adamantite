---
"adamantite": patch
---

Name the fixes that work in the `anti-slop/no-object-parameters` message

The message now suggests a named domain type, `WeakKey` for a `WeakMap` or `WeakSet` key, or a generic `<T extends object>` that keeps the caller's type. The rule reports the same code as before.
