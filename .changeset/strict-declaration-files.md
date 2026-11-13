---
"adamantite": patch
---

Accept `unknown`, `object`, and dictionary types in a declaration file in the strict preset

The strict lint preset now turns off `anti-slop/no-unknown-parameters`, `anti-slop/no-unknown-returns`, `anti-slop/no-object-parameters`, and `anti-slop/no-unsafe-dictionary-type` in `*.d.ts` files. A declaration file states the types of code that it does not hold, such as a built-in API or a package without types, so it cannot change those signatures.
