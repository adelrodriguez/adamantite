---
"adamantite": minor
---

Support Bun 1.0 and Node.js 22.19 or later while using current runtimes for development.

Generated GitHub Actions workflows now follow the target project's Node.js version declaration (`.node-version`, `.nvmrc`, `.tool-versions`, or `package.json`) through `node-version-file`, and fall back to `node-version: "lts/*"` when no declaration exists. `adamantite update` migrates existing managed workflows away from a hard-coded Node.js version.
