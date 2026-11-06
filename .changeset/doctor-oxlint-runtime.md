---
"adamantite": patch
---

Doctor reports when the installed packages cannot run Oxlint

Doctor resolves the Oxlint runtime as `adamantite check` and the editors do, and starts no tool to do it. It reports a declared package that is not installed, such as `oxlint` or `tsrs`, and an `@effect/tsgo` that has no build for the installed Oxlint, tsrs, or platform. A project that declares its packages but has not installed them now gets these findings, so run Doctor after the install.
