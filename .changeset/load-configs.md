---
"adamantite": minor
---

Read configs, disable comments, and syntax trees from the tools, instead of parsing source

Doctor, `init`, `update`, `harden`, and `rule test` now load `oxlint.config.ts`, `oxfmt.config.ts`, `knip.config.ts`, and the Oxlint config of each workspace package with Node.js, in a separate process, and read the default export. They no longer parse the source, so a config can build its settings with spreads, variables, function calls, and shared packages. A config runs its own code when it loads, as it does when the tool loads it.

- A preset counts when the loaded config applies it, also through a spread such as `{ ...analyze }` or through a shared config package. Each preset names itself under a symbol key that the tools ignore, so the project must install the Adamantite version that runs the command.
- A config that Node.js cannot load gets the `invalid-oxlint-config`, `invalid-oxfmt-config`, or `invalid-knip-config` finding with the error that Node.js printed.
- The Knip check reads the loaded `ignoreDependencies`, so an entry counts as a name or as a regular expression that matches it.
- Custom rule discovery reads the rules folder, the plugin name, and the calling file of each `custom()` call that a loaded config reaches. A `dir` or a `name` that a variable sets now counts, and a `custom()` call in an imported module counts without import resolution. Doctor and `rule test` warn about a config that does not load, and no longer warn about an import that they cannot resolve or a `dir` or `name` that is not a string literal.
- `harden --json` lists the configs that Node.js cannot load in `unloadedConfigs`, and the trials of `harden` read the overrides of the loaded config, so an override that a spread or a function adds also gets a trial.

Doctor also runs Oxlint to load the lint configs. When a config fails to load, such as one that imports a preset that the installed Adamantite does not export, Doctor reports the `oxlint-config-load-failure` finding with the error that Oxlint printed, and exits 1. Before, Doctor only warned that it could not list the Oxlint files, and `adamantite check` failed without a finding. The finding and the Adamantite skill point to the changelog for the preset that replaces a removed one.

`harden` now counts the disable comments that Oxlint parses, and `rule ast` prints the syntax tree that Oxlint gives rules. A small internal Oxlint plugin reports them, so both commands run the Oxlint of the project, and `rule ast` fails when the project has no Oxlint. `rule ast` prints the tree with `range`, `comments`, and `tokens` beside `start` and `end`, and without the link from a node to its parent. A `bigint` literal value prints as its digits. A file that Oxlint does not lint, such as a CSS file, fails with an error that says so. When Oxlint cannot read the comments, `harden` asks the agent to count them, as it does when Oxlint cannot list its files.
