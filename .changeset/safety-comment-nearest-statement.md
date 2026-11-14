---
"adamantite": patch
---

Make `antislop/require-safety-comment-for-type-assertion` read only the comment above the assertion's own statement

One `SAFETY:` comment above a test call or a function used to cover every assertion in an `if`, `for`, `while`, or `switch` header inside it. A trailing comment at the end of the previous line, such as `const a = 1 // SAFETY: ...`, also counted for the next line. The rule now stops at the nearest statement and ignores a trailing comment of earlier code. A comment above a `for` statement now covers an assertion in its initializer.
