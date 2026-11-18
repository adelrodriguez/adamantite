---
"adamantite": minor
---

Report indirect access to Reflect, and accept a `Reflect.get` receiver, in `quality/no-reflect-get` and `quality/no-reflect-apply`

The strict preset now reports a `Reflect.get` or `Reflect.apply` call that the code reaches through a `const` alias such as `const R = Reflect`, through `globalThis.Reflect`, through destructuring such as `const { get } = Reflect`, through `.call` or `.apply` on the method, or through a template literal key such as ``Reflect[`get`]``.

A Proxy `get` trap forwards its receiver with `Reflect.get(target, key, receiver)`, so a getter gets the correct `this`, and property syntax cannot pass a receiver. So the strict preset no longer reports a `Reflect.get` call that passes a receiver different from the target, also through `.call` and `.apply`. A call without a receiver, or with the target as the receiver, is still reported.
