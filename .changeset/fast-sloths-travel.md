---
"adamantite": patch
---

Let a promise rejection callback take `error: unknown` in the strict preset

`anti-slop/no-unknown-parameters` no longer reports the first parameter of a `.catch()` callback or of the rejection callback of `.then()`. A project that extends the core and strict presets can now write `.catch((error: unknown) => ...)`, which `typescript/use-unknown-in-catch-callback-variable` asks for. Before, every way to write the parameter got a report from one of the three rules.
