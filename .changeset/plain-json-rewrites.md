---
"adamantite": minor
---

Rewrite only plain JSON files, and remove the `jsonc-parser` dependency

`adamantite init` no longer edits a `tsconfig.json`, `.vscode/settings.json`, or `.zed/settings.json` that has comments or trailing commas. It keeps the file as it is, prints the change to make by hand, such as the `extends` value to set, and continues with the next step. Before, init edited these files in place and kept their comments.

A plain JSON file is now written with two-space indentation, and it keeps the key order of the project file. A parse error now shows one line and column, such as `Invalid JSONC at line 3, column 3`. Adamantite reads these files with the parsers in Effect, so target projects no longer install `jsonc-parser`. A `__proto__` key in a project file is now read as an ordinary key.
