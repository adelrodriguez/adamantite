---
"adamantite": patch
---

Doctor reports when the installed packages cannot run Oxlint

Doctor resolves the Oxlint runtime as `adamantite check` and the editors do, without starting tools or loading native code. It reports missing declared packages, missing stock native files, and unsupported `@effect/tsgo` builds for the installed Oxlint, tsrs, or platform. Local bindings and `TSRS_BINARY` overrides remain supported. A project whose dependencies are not fully installed now gets these findings, so run Doctor after the install.
