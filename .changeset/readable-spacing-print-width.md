---
"adamantite": minor
---

Count a line past the print width as multiline in `quality/require-readable-spacing`, so one `adamantite fix` passes `check`

Oxfmt wraps a statement whose line ends past its `printWidth`, and the wrapped statement needs blank lines around it. `adamantite fix` applies Oxlint fixes before it formats, so Oxfmt could wrap a line after the lint stage, and `check` then failed on a blank line that `fix` had not added. The rule now counts a one-line statement that ends past column 100 as multiline, so it asks for those blank lines before Oxfmt wraps the line. A line that Oxfmt cannot wrap, such as a long template literal, also gets blank lines. If your Oxfmt config sets another `printWidth`, set the rule's new `printWidth` option to the same value. Oxlint still applies one pass of fixes, so a fix that causes a new fixable report needs a second `fix`.

The rule also keeps single-line bindings grouped before an ASI-guard semicolon. Without semicolons, Oxfmt writes a statement that starts with `[` or `(` as `;[a, b].forEach(f)`. The parser made that semicolon the last token of the binding above it, so the rule counted the binding as two lines, reported it and the next statement, and its fix split the group. The rule now ends a statement at its last token before that semicolon.
