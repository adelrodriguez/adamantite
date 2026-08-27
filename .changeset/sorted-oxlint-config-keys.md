---
"adamantite": patch
---

Emit `oxlint.config.ts` with sorted keys so a fresh `adamantite check` passes

The core preset enables `sort-keys`, but `adamantite init` generated the config with its keys in `options`, `ignorePatterns`, `extends` order, so running the managed `check` script in a freshly initialized project immediately failed on the file init had just written. The generator now sorts the top-level keys and the keys inside `options` in the order the rule expects. Caught by the new `test:smoke` script, which runs the built CLI's `init` against a real fixture project and then executes the real oxlint, oxfmt, and knip binaries on the result.
