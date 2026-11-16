---
"adamantite": minor
---

Write each setup file whole as a managed file, and stop merging into files that you wrote

`adamantite init` and `adamantite update` now write each setup file only whole, and only when the file does not exist or still holds what Adamantite wrote, by its hash in `.adamantite/adamantite-lock.json`. A file that an earlier version wrote and nobody changed is replaced with the current version. A file that you changed is kept, and `adamantite doctor` reports each change that breaks the setup. When the setup no longer uses a file, `update` deletes it if nobody changed it. Adamantite no longer merges its settings into a file that you wrote, and no longer stops or prints a change to make by hand when the file has comments.

These are the managed files, with what Doctor checks in a file that you changed:

- `oxlint.config.ts` lists its imports in the order that Oxfmt sorts them, and wraps `extends` when it passes 100 characters, so `adamantite fix` leaves it unchanged. Doctor reports a lint preset that the lockfile selects and no Oxlint config of the project applies, with the new `missing-lint-preset` finding. A preset counts as applied in `extends`, in an `overrides` entry that spreads its `rules`, as the jest and vitest presets show, and in the Oxlint config of a workspace package. Doctor also requires the plugin package of a preset that only a workspace package config applies.
- `oxfmt.config.ts` lists its imports in the order that Oxfmt sorts them. Doctor reports a config that no longer uses `adamantite/format`.
- `knip.config.ts` gets the ignore lists of the recorded selection, so a project that selects the `effect` preset gets the `@effect/language-service` entry on the first `init`. Doctor reports a config that no longer uses `adamantite/analyze` or misses an ignore list that the setup needs. The `missing-knip-config` finding now says to run `adamantite update`.
- `tsconfig.json` extends the selected TypeScript preset, and adds the `@effect/language-service` entry when the setup includes the `effect` preset. Doctor reports a missing or mismatched preset, type resets in a library, and a missing language service entry. It finds the preset through each relative base config that `extends` reaches, such as a shared `tsconfig.base.json`, but not through a base config from another package, such as `@company/config`. In a monorepo, Adamantite still writes no root `tsconfig.json`, and Doctor reports the packages that need the preset. A root `tsconfig.json` that Adamantite wrote before the project became a monorepo stays managed.
- `.vscode/settings.json` and a new `.vscode/extensions.json`. The extensions file recommends `oxc.oxc-vscode` for the `check` and `fix` scripts, `webpro.vscode-knip` for `analyze`, and `TypeScriptTeam.native-preview` for the `effect` preset, so VS Code offers to install them. Doctor reports a missing Oxlint entry or a missing extension recommendation. `update` now also prepares the Effect editor SDK for VS Code, and the `vscode-effect-sdk` finding says to run `adamantite update`. A project without a matching Effect build gets that finding, and `init` continues instead of failing.
- `.zed/settings.json`. Doctor reports a missing Oxlint entry and a missing Effect language server, and the Effect editor messages now say to run `adamantite update`. Zed reads `auto_install_extensions` only from the user settings, so `init` prints the link of each Zed extension whenever it sets up Zed.
- `.github/workflows/adamantite.yml` gets the jobs for the scripts of the recorded setup. Doctor reports a workflow in which no job runs a CI script of the setup, or a job hard-codes a Node.js version. A workflow that `init` cannot write now fails `init` instead of leaving a warning.
- `AGENTS.md` is written with the Adamantite section only when the project has no `AGENTS.md`. Doctor reports an `AGENTS.md` without the section with the new `missing-agents-section` finding, and the `missing-agents-md` finding now says to run `adamantite update`.
- Each file of the Adamantite skill in `.agents/skills`, `.claude/skills`, and `.grok/skills`. A copy that matches what Adamantite wrote passes, also in the layout of the project's Oxfmt config. Doctor reports a copy that differs from the shipped skill and from what Adamantite wrote with the new `stale-adamantite-skill` finding, which says to delete the copy and run `adamantite update`. A copy that an earlier version wrote before the lockfile gets that finding once. When a copy misses a file of the skill, Doctor reports the new `missing-adamantite-skill` finding, and `update` writes the missing file.

`adamantite init --script <name>`, and each script that you select in interactive `init`, now sets that `package.json` script to its Adamantite command and replaces what it ran. `init` prints each script that it added or replaced, with the command that it ran before, and `update` sets the scripts of the recorded selection the same way. A script that you did not select stays as it is. To keep custom tool arguments, pass them after `--` in a script with a name of your own, such as `adamantite analyze -- --directory packages/app`.

A project with `.oxlintrc.json`, `.oxfmtrc.json`, `knip.json`, or their `.jsonc` forms gets no TypeScript config for that tool, because Oxlint fails when it finds both, Oxfmt loads neither, and Knip loads the JSON config first. Doctor reports the JSON config, also beside a TypeScript config, with the `conflicting-oxlint-config`, `conflicting-oxfmt-config`, or `conflicting-knip-config` finding and the migration. These findings replace `legacy-<tool>-config` and `shadowed-legacy-<tool>-config`, and `init` no longer warns about a JSON config.

These options and blocks are removed:

- `--overwrite-scripts`, because `--script` always sets the selected script. `init` no longer keeps a conflicting `check`, `fix`, or `analyze` script, warns about it, or asks whether to replace it.
- `--install-extensions` and its prompt, which ran `code --install-extension`. `.vscode/extensions.json` replaces it.
- The `# ADAMANTITE:START` and `# ADAMANTITE:END` block of the GitHub Actions workflow, and the `malformed-adamantite-workflow` finding. Adamantite no longer replaces the jobs between the comments of a workflow that you changed.
- The `<!-- ADAMANTITE:START -->` and `<!-- ADAMANTITE:END -->` section of an existing `AGENTS.md`. Adamantite no longer splices the section into it.

To migrate:

1. Remove `--overwrite-scripts` and `--install-extensions` from scripts and CI that pass them.
2. Run `adamantite update`.
3. Run `adamantite doctor`, and repair each finding for a file that you changed.
