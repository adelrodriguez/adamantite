---
"adamantite": patch
---

Stop reporting and rewriting `effect/String` and `effect/Array` functions as built-in methods in the effect preset

The effect lint preset now turns off the core rules `unicorn/prefer-string-slice`, `unicorn/prefer-array-find`, and `unicorn/prefer-array-some`. The rules match a method by its name only:

- The fix of `prefer-string-slice` rewrote `String.substring(1)` from `effect/String` to `String.slice(1)`. That is a different Effect function, which reads a negative index from the end.
- `prefer-array-find` reported `Array.filter(values, predicate)[0]` and told you to use `find`, which `effect/Array` does not have.
- `prefer-array-some` reported `Array.filter(values, predicate).length > 0`.

In a project with the effect preset, the three rules no longer report the same patterns on native strings and arrays.
