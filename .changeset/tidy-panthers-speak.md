---
"adamantite": patch
---

Include the underlying cause in file-system and extension error messages. Failed read, write, delete, and directory-creation operations now show the platform error detail, and a failed VS Code extension install reports the `code` CLI exit code.
