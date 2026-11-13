---
"adamantite": patch
---

Accept a capital letter at the start of a describe title in the vitest and jest presets

`vitest/prefer-lowercase-title` and `jest/prefer-lowercase-title` now have `ignore: ["describe"]`, so `describe("Calculator", ...)` passes. A describe title often names the class or function under test. The rules still report a test title that starts with a capital letter.
