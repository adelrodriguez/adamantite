---
"adamantite": patch
---

Accept the data-first `Effect.catch(effect, handler)` in the effect preset

The effect lint preset now turns off the core rule `promise/valid-params`. The rule matches a method by its name only, so it reported `Effect.catch(load("a"), () => load("b"))` as `Promise.catch()` with 2 arguments. In a project with the effect preset, the rule no longer checks the arguments of `Promise` methods. The type check still reports a promise method call with the wrong arguments.
