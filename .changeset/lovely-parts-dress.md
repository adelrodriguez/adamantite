---
"adamantite": minor
---

Add `format` command powered by oxfmt

Formats JavaScript, TypeScript, JSX, TSX, JSON, JSONC, and CSS files using oxfmt (oxc's formatter). The formatter is configured via `.oxfmtrc.json` with opinionated defaults including:

- 100 character line width
- 2 space indentation
- No semicolons
- Sorted imports with customizable grouping
- Trailing commas for ES5 compatibility

Configuration is automatically generated when running `adamantite init` or `adamantite update`. VSCode settings are updated to use oxc-vscode extension as the default formatter.
