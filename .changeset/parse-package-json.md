---
"adamantite": patch
---

Report a `package.json` with an unexpected shape instead of crashing

A `package.json` that held `null`, an array, or a field with the wrong type, such as `"scripts": "build"`, made `adamantite doctor`, `init`, `update`, and `check` crash with a JavaScript stack trace. Adamantite now checks the fields it reads, and stops with a message that names the file and the field.
