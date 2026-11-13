---
"adamantite": patch
---

Accept a spread copy of an item in a `map` callback in the core preset

The core lint preset no longer enables `oxc/no-map-spread`. The rule reported `{ ...item, done: true }` in a `map` callback and told the author to change the item in place. `prefer-object-spread` reports the `Object.assign({}, …)` form, so no immutable copy passed core. React state updates use this copy in reducers and event handlers. Suppressions that name `oxc/no-map-spread` are now unused, so you can delete them.
