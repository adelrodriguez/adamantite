---
"adamantite": patch
---

Fit the strict preset's overrides to declaration files and to the test files of the jest and vitest presets

The strict lint preset now turns off `quality/no-unknown-parameters`, `quality/no-unknown-returns`, `quality/no-object-parameters`, and `quality/no-unsafe-dictionary-type` in `*.d.ts` files. A declaration file states the types of code that it does not hold, such as a built-in API or a package without types, so it cannot change those signatures.

The strict preset also selects its test files with the `testFiles` globs of the jest and vitest presets, so the three presets agree on which files are test files. The override that allows a type assertion with a safety comment now also applies to `.js`, `.jsx`, `.mjs`, and `.cjs` test files. In a `__tests__` folder, it applies only to files with these extensions and the TypeScript extensions, so a `.vue`, `.svelte`, or `.astro` file in that folder now gets the strict rules for ordinary files.
