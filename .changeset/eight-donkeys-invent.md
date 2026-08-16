---
"adamantite": patch
---

Migrate the build from bunup to tsdown with unplugin-macros, and author the lint presets with oxlint's `defineConfig`. Each compiled preset inlines its own copy of the `defineConfig` identity shim, so they remain self-contained and import with no dependencies installed, and their declaration files now carry the exact rule literals instead of the broad `OxlintConfig` type.
