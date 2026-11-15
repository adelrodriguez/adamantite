---
"adamantite": minor
---

Read the Oxlint, Oxfmt, and Knip configs by loading them, as the tools do

Doctor, `init`, `update`, `harden`, and `rule test` now load `oxlint.config.ts`, `oxfmt.config.ts`, `knip.config.ts`, and the Oxlint config of each workspace package with Node.js, in a separate process, and read the default export. They no longer parse the source, so a config can build its settings with spreads, variables, function calls, and shared packages. A config runs its own code when it loads, as it does when the tool loads it.

- A preset counts when the loaded config applies it, also through a spread such as `{ ...analyze }` or through a shared config package. Each preset names itself under a symbol key that the tools ignore, so the project must install the Adamantite version that runs the command.
- A config that Node.js cannot load gets the `invalid-oxlint-config`, `invalid-oxfmt-config`, or `invalid-knip-config` finding with the error that Node.js printed.
- The `core-preset-order` finding names the preset modules, such as `adamantite/lint/strict`, instead of their import names.
- The Knip check reads the loaded `ignoreDependencies`, so an entry counts as a name or as a regular expression that matches it.
- Custom rule discovery reads the rules folder, the plugin name, and the calling file of each `custom()` call that a loaded config reaches. A `dir` or a `name` that a variable sets now counts, and a `custom()` call in an imported module counts without import resolution. Doctor and `rule test` warn about a config that does not load, and no longer warn about an import that they cannot resolve or a `dir` or `name` that is not a string literal.
- `harden --json` replaces `unresolvedCalls` with `unloadedConfigs`, the configs that Node.js cannot load.
- The trials of `harden` read the overrides of the loaded config, so an override that a spread or a function adds also gets a trial.
