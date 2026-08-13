---
"adamantite": patch
---

Show the captured package manager output when dependency installation fails during `init`. The error message now includes the underlying diagnostic, for example `ERR_PNPM_UNSUPPORTED_ENGINE`, instead of only the package list.
