---
"adamantite": patch
---

Stop the effect preset from reporting Effect calls as array method mistakes

The core preset turns on `unicorn/no-array-callback-reference` and `unicorn/no-array-method-this-argument`. Both rules match an array method by its name only, so they reported ordinary Effect code, such as `Option.some(value)` and the data-first `Array.findLast(values, predicate)`. The `effect` preset now turns both rules off. A project without the `effect` preset keeps them.
