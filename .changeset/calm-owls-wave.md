---
"adamantite": minor
---

Deprecate `adamantite format`. The command still runs Oxfmt with the same flags, file arguments, and forwarded arguments, but it now prints a deprecation warning on stderr and its help description is marked as deprecated. Use `adamantite fix` to apply formatting and `adamantite check` to verify it. The next release removes the command.
