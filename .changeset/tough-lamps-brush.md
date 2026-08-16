---
"adamantite": minor
---

Add canonical `ignorePatterns` (dependencies, build output, generated code) to the core lint preset, exported both on the preset and as a named export. Oxlint does not merge `ignorePatterns` from extended configs, so generated `oxlint.config.ts` files now hoist `core.ignorePatterns` onto the root config, appending any project-specific patterns carried over from a legacy config.
