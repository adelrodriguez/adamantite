---
"adamantite": patch
---

Apply the strict test-file rules to the test files of the jest and vitest presets

The strict lint preset now selects its test files with the `testFiles` globs of the jest and vitest presets, so the three presets agree on which files are test files. The override that allows a type assertion with a safety comment now also applies to `.js`, `.jsx`, `.mjs`, and `.cjs` test files. In a `__tests__` folder, it applies only to files with these extensions and the TypeScript extensions, so a `.vue`, `.svelte`, or `.astro` file in that folder now gets the strict rules for ordinary files.
