---
"adamantite": patch
---

Let `anti-slop/no-reflect-get` accept a `Reflect.get` call that passes a receiver

A Proxy `get` trap forwards its receiver with `Reflect.get(target, key, receiver)`, so a getter gets the correct `this`. Property syntax cannot pass a receiver, so the strict preset no longer reports this call. A call without a receiver, or with the target as the receiver, is still reported.
