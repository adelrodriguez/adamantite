---
"adamantite": patch
---

Lint faster with the strict preset's quality rules

The quality rules now record type declarations while Oxlint walks a file, instead of walking each file a second time. `quality/no-widen-then-assert`, `quality/no-shape-in-symbol-names`, and `quality/no-known-value-widening` now build scope analysis only for a file that has a candidate to check. On three TypeScript projects of 400 to 950 files, the rules spent about 45% less time per lint, and a lint with only these rules took about 25% less time. The rules report the same diagnostics as before.
