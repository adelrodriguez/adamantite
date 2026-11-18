---
"adamantite": minor
---

Read only the comment above the assertion's own statement, and reject blank markers, in `quality/require-safety-comment-for-type-assertion`

One `SAFETY:` comment above a test call or a function used to cover every assertion in an `if`, `for`, `while`, or `switch` header inside it. A trailing comment at the end of the previous line, such as `const a = 1 // SAFETY: ...`, also counted for the next line. The rule now stops at the nearest statement and ignores a trailing comment of earlier code. A comment above a `for` statement covers an assertion in its initializer.

The `markers` option accepted an entry with only spaces, and the rule dropped it without a warning. `{ "markers": ["  "] }` fell back to `SAFETY:`, and `{ "markers": ["WHY", " "] }` lost its second entry. Oxlint now stops with an options validation error for a blank marker, so remove the blank entry from your config.
