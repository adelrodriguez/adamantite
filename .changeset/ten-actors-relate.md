---
"adamantite": patch
---

Improve CLI error reporting when config parsing fails during commands like `adamantite init`.

When Adamantite fails to parse JSON/JSONC files, it now reports the affected file path and parser details instead of only surfacing a generic tagged error. Invalid config shape errors are also reported with a clearer message explaining that a JSON object is required.
