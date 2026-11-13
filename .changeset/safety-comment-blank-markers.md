---
"adamantite": minor
---

Reject blank markers in `anti-slop/require-safety-comment-for-type-assertion`

The `markers` option accepted an entry with only spaces, and the rule dropped it without a warning. `{ "markers": ["  "] }` fell back to `SAFETY:`, and `{ "markers": ["WHY", " "] }` lost its second entry. Oxlint now stops with an options validation error for a blank marker, so remove the blank entry from your config.
