---
"adamantite": patch
---

Migrate build tool from tsdown to bunup

Updates the build configuration to use bunup instead of tsdown for bundling the CLI. This is an internal tooling change that improves build performance and aligns with Bun's ecosystem, with no impact on the public API or CLI functionality.