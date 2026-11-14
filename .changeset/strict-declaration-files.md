---
"adamantite": patch
---

Accept `unknown`, `object`, and dictionary types in a declaration file in the strict preset

The strict lint preset now turns off `antislop/no-unknown-parameters`, `antislop/no-unknown-returns`, `antislop/no-object-parameters`, and `antislop/no-unsafe-dictionary-type` in `*.d.ts` files. A declaration file states the types of code that it does not hold, such as a built-in API or a package without types, so it cannot change those signatures.
