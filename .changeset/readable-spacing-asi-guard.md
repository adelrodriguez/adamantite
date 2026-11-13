---
"adamantite": patch
---

Keep single-line bindings grouped before an ASI-guard semicolon in `require-readable-spacing`

Without semicolons, Oxfmt writes a statement that starts with `[` or `(` as `;[a, b].forEach(f)`. The parser makes that semicolon the last token of the binding above it, so `anti-slop/require-readable-spacing` counted the binding as two lines. It reported the binding and the next statement, and its fix split a group of single-line bindings. The rule now ends a statement at its last token before that semicolon.
