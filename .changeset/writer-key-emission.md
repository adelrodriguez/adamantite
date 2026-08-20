---
"adamantite": patch
---

Fix knip and oxfmt migrations writing non-identifier config keys as bare identifiers

The config writers interpolated keys directly into the generated `*.config.ts`, so a legal knip key such as `lint-staged` or a rule name containing punctuation produced invalid TypeScript. Keys are now emitted through `serializeTsPropertyKey`, which quotes non-identifier keys and writes `__proto__` as a computed property.
