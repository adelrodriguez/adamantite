---
"adamantite": minor
---

Let `antislop/no-reflect-get` and `antislop/no-reflect-apply` report indirect access to Reflect

The strict preset now reports a `Reflect.get` or `Reflect.apply` call that the code reaches through a `const` alias such as `const R = Reflect`, through `globalThis.Reflect`, through destructuring such as `const { get } = Reflect`, through `.call` or `.apply` on the method, or through a template literal key such as ``Reflect[`get`]``. A `Reflect.get` call that passes a receiver different from the target is still allowed, also through `.call` and `.apply`.
