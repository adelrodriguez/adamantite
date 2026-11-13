---
"adamantite": minor
---

Count a line past the print width as multiline in `require-readable-spacing`

Oxfmt wraps a statement whose line ends past its `printWidth`, and the wrapped statement needs blank lines around it. `anti-slop/require-readable-spacing` now counts a one-line statement that ends past column 100 as multiline, so it asks for those blank lines before Oxfmt wraps the line. A line that Oxfmt cannot wrap, such as a long template literal, also gets blank lines. If your Oxfmt config sets another `printWidth`, set the rule's new `printWidth` option to the same value.
