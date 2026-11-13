# Oxfmt formats Astro files for Astro 7 and later

Oxfmt formats `.astro` files when its config sets `astro`. It formats them through
`prettier-plugin-astro`, which imports `@astrojs/compiler-rs` at run time. Oxfmt does not bundle the
compiler, and fails on each `.astro` file that it cannot load the compiler for. Until now, the format
preset left `astro` off, so Oxfmt skipped Astro files, and the Zed settings formatted them with Zed's
managed Prettier. We decided (2026-11-13, issue #752) that Adamantite formats Astro files with Oxfmt,
and that it supports this only for Astro 7 and later.

## How the project gets the compiler

`astro` 7.0.0 and later depend on `@astrojs/compiler-rs`. Astro 5 and 6 depend on the older
`@astrojs/compiler`. So an Astro 7 project already installs the compiler, and Adamantite does not
manage it as a package. Oxfmt imports the compiler from its own package folder, and Node.js looks
for it in each `node_modules` folder above that one:

- npm puts the compiler in the project's `node_modules`.
- pnpm keeps it out of the project's `node_modules`. With pnpm's default `hoist-pattern`, it is in
  `node_modules/.pnpm/node_modules`, which is above Oxfmt's folder in the store. The smoke test
  formats an Astro file in a pnpm project with Astro 7.4.11.

## The parts

- The format preset sets `astro: true`. Oxfmt loads the compiler only when it formats an `.astro`
  file, so a project without Astro files is not affected.
- Doctor reports `unavailable-astro-compiler` when `package.json` declares `astro` and the compiler
  does not resolve from the installed Oxfmt. The finding says to update Astro to 7, or to add
  `@astrojs/compiler-rs` when the package manager hides dependencies of dependencies. The check sits
  in `tooling/oxfmt/astro.ts`, and the Oxfmt integration runs it through the `assessRuntime` option
  of `defineConfigTooling`.
- Zed formats Astro files with the `oxfmt` language server, and turns off Prettier for them, as for
  the other managed languages. The Oxc extension for Zed attaches Oxfmt to Astro. `update` replaces
  the Prettier setup that Adamantite wrote before, and keeps an Astro setup that the project changed.
  Doctor reports the old setup as `legacy-zed-astro-formatter`.
- VS Code sets `oxc.oxc-vscode` as the formatter for `[astro]`. The Astro extension sets its own
  formatter for Astro, which takes priority over the global default.

## Considered options

- **Install and pin `@astrojs/compiler-rs` for each Astro project.** This also supports Astro 5
  and 6. But Adamantite would pin a second version of a package that `astro` already pins, and the
  two could differ.
- **Set `astro` only in the config that `init` writes for an Astro project.** A project that adds
  Astro later would need a config change, and Doctor would need to compare two config shapes.

## Consequences

- In an Astro 5 or 6 project, `adamantite check` and `adamantite fix` now fail on `.astro` files.
  Before this decision, Oxfmt skipped them. Doctor reports the cause.
- Doctor checks only the root `package.json`. In a monorepo that declares `astro` only in a
  workspace package, Doctor does not report a missing compiler.
- A pnpm project that turns off hoisting, or a Yarn Plug'n'Play project, can hide the compiler from
  Oxfmt. Nobody has tested those setups.
