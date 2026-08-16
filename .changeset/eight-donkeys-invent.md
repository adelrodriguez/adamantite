---
"adamantite": patch
---

Migrate the build from bunup to tsdown with unplugin-macros, and author the lint presets with oxlint's `defineConfig`. Compiled presets inline the `defineConfig` call, so they still import with no dependencies installed, and their declaration files now carry the exact rule literals instead of the broad `OxlintConfig` type.
