---
"adamantite": patch
---

Stop `init` from setting up Oxlint in a folder that a parent Oxlint config lints

`init` in a subfolder wrote an `oxlint.config.ts` with `options.typeAware`, `options.typeCheck`, and `options.respectEslintDisableDirectives`. Oxlint accepts those options only in the root config, so `adamantite check` failed in the parent project. Now, when the selection includes a script that runs Oxlint and any parent folder up to the filesystem root has an Oxlint config, also past a folder that holds `.git`, `init` fails with `ParentOxlintConfig` before it changes a file. Run `adamantite init` at the root of the parent project, or extend the root config in the folder, as "Custom rules in a monorepo" in the README shows. A nested `init` without a lint script, such as one that sets up only an editor, still works.
