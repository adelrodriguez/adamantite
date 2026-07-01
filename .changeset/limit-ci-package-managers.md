---
"adamantite": patch
---

Limit GitHub Actions workflow generation to the supported package managers (`bun`, `deno`, `npm`, `pnpm`, `yarn`). When another package manager is detected, Adamantite now skips workflow setup with a warning instead of emitting an unsupported workflow.
