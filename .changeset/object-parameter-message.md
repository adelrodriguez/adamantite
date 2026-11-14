---
"adamantite": patch
---

Name the fixes that work in the `antislop/no-object-parameters` message

The message now suggests a named domain type, `WeakKey` for a `WeakMap` or `WeakSet` key, or a generic `<T extends object>` that the signature uses again, such as in the return type. A generic with one use fails the core preset's `typescript/no-unnecessary-type-parameters`. The rule reports the same code as before.
