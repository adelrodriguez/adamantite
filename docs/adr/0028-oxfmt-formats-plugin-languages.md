# Oxfmt formats the plugin languages: Astro 7 and Svelte 5

Oxfmt formats Astro and Svelte files through bundled Prettier plugins, when its config sets the
`astro` or `svelte` option. Each plugin imports a package from the project at run time:
`prettier-plugin-astro` imports `@astrojs/compiler-rs`, and `prettier-plugin-svelte` imports
`svelte/compiler`. Oxfmt bundles neither package, and fails on each file of the language when it
cannot load a supported version. Oxfmt declares both packages as optional peer dependencies, with
the versions that it supports: `@astrojs/compiler-rs` `^0.5.0` and `svelte` `^5.0.0` in Oxfmt
0.78.0.

Until now, the format preset left both options off, so Oxfmt skipped these files, and the Zed
settings formatted Astro files with Zed's managed Prettier. We decided (2026-11-13, issue #752)
that Adamantite formats these languages with Oxfmt, and that it supports Astro 7 and later and
Svelte 5 and later. GLOSSARY.md calls them plugin languages.

## How the project gets the packages

`astro` 7.0.0 and later depend on `@astrojs/compiler-rs`. Astro 5 and 6 depend on the older
`@astrojs/compiler`. A Svelte project depends on `svelte` itself, and only Svelte 5 works: the
plugin fails on Svelte 3 and 4 with "Cannot read properties of undefined (reading 'nodes')". So a
supported project already installs the package, and Adamantite does not manage it.

Oxfmt imports the package from its own package folder, and Node.js looks for it in each
`node_modules` folder above that one. npm puts `@astrojs/compiler-rs` in the project's
`node_modules`. pnpm keeps it out of the project's `node_modules`, but with pnpm's default
`hoist-pattern`, it is in `node_modules/.pnpm/node_modules`, which is above Oxfmt's folder in the
store. The smoke test formats an Astro file and a Svelte file in a pnpm project.

## The parts

`tooling/oxfmt/languages.ts` holds `pluginLanguages`, the one list of the plugin languages. Each
entry names the Oxfmt option, the framework package that marks a project, the package that the
plugin imports, the editor language names, and how a project gets a supported version. A new
plugin language is a new entry.

- The format preset sets each option to `true`. Oxfmt loads a package only when it formats a file
  of its language, so a project without those files is not affected. The preset does not import
  from `src`, so a test fails when the preset and the list disagree. Another test fails when the
  list and the optional peers of the installed Oxfmt disagree, so an Oxfmt update that adds a
  plugin language fails the tests until the list has it.
- Doctor reports `unavailable-<option>-plugin` for each language whose framework `package.json`
  declares, when the package does not resolve from the installed Oxfmt, or when its version is
  outside the range that Oxfmt declares. The range comes from Oxfmt's `peerDependencies`, and
  `semver` compares it, so an Oxfmt update moves the ranges without a change to Adamantite. The
  Oxfmt integration runs the check through the `assessRuntime` option of `defineConfigTooling`.
- Zed formats each plugin language with the `oxfmt` language server, and turns off Prettier for
  it, as for the other managed languages. The Oxc extension for Zed attaches Oxfmt to both
  languages. `update` keeps an entry that the project wrote, because Zed uses an explicit
  `formatter` before Prettier, and replaces only the Prettier setup that Adamantite wrote for Astro
  before. Doctor reports that old setup as `legacy-zed-astro-formatter`.
- VS Code sets `oxc.oxc-vscode` as the formatter of each plugin language. The Astro and Svelte
  extensions set their own formatters, which take priority over the global default.

## Considered options

- **Install and pin each package.** This also supports Astro 5 and 6. But Adamantite would pin a
  second version of a package that the framework already pins, and the two could differ. For
  Svelte, the package is the framework itself.
- **A module for each language, with a definer, as for the managed Oxlint plugins.** Each language
  is data today, so one list is enough. A language with its own behavior is the time to split.
- **Set the options only in the config that `init` writes for such a project.** A project that
  adds a framework later would need a config change, and Doctor would need to compare config
  shapes.

## Consequences

- In an Astro 5 or 6 project, or a Svelte 3 or 4 project, `adamantite check` and `adamantite fix`
  now fail on the files of that language. Before this decision, Oxfmt skipped them. Doctor reports
  the cause. npm already refuses to install Svelte 4 next to Oxfmt 0.78.0, because of the optional
  peer range.
- Doctor checks only the root `package.json`. In a monorepo that declares a framework only in a
  workspace package, Doctor does not report a missing package.
- A pnpm project that turns off hoisting, or a Yarn Plug'n'Play project, can hide
  `@astrojs/compiler-rs` from Oxfmt. Nobody has tested those setups.
