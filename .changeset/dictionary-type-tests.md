---
"adamantite": patch
---

Stop reporting type tests in `anti-slop/no-unsafe-dictionary-type`

The rule no longer reports `Record<string, unknown>` in a conditional type test, such as `T extends Record<string, unknown> ? A : B`, or as the filter of the built-in `Extract` and `Exclude`. Those positions ask whether a type is a plain object, and `object` gives a different answer for interfaces and arrays. The rule still reports a dictionary in a type alias, a parameter, or the result of a conditional type.
