---
"adamantite": patch
---

Keep comments and formatting when `adamantite init` updates an existing JSON file. Before, `init` rewrote `.vscode/settings.json`, `.zed/settings.json`, `tsconfig.json`, and `package.json` with two-space indentation, which removed every comment and changed tab or four-space indentation. Now `init` edits only the values that it changes. Comments, trailing commas, indentation, line endings, and key order stay as they are, and new keys go at the end of their object.
