---
"adamantite": patch
---

Write the `custom()` entry module to a temporary folder that only you can write

When no writable `node_modules` folder is above a rules folder, `custom()` wrote its entry module to `adamantite` in the OS temporary directory, and Oxlint then imported it. On a system where users share `/tmp`, another user could create that folder first and replace the module, so Oxlint would run their code as you. The fallback is now `adamantite-<uid>`, which `custom()` creates with access for the current user only. `custom()` refuses that folder when another user owns it or can write to it.
