---
"adamantite": patch
---

Start Oxlint's own CLI from `adamantite check`, `fix`, and `harden`, so Effect loads once per command

The CLI now resolves the project's Oxlint runtime itself and starts Oxlint's `dist/cli.js` with `node`, with the runtime's variables and preload module. No second Node.js process loads Effect to resolve the runtime again, so linting starts sooner. Editors still start `node_modules/adamantite/dist/oxlint.js`, which no longer reads `ADAMANTITE_PROJECT`. When Oxlint is missing, `adamantite check` still checks the formatting, then fails with the error that names the repair.
