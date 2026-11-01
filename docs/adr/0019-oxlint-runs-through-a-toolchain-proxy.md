# Oxlint runs through a toolchain proxy

The `effect` preset needs the Effect builds of the Oxlint native binding and oxlint-tsgolint,
which `@effect/tsgo` ships. ADR 0007 put those builds in `node_modules` with
`effect-tsgo patch`. Each install restored the stock files, so the target project needed
`"prepare": "adamantite prepare"`. A production-only install then failed with
`adamantite: not found`. The patch could not write to a read-only or shared package store, and
it blocked a second patch, such as the one from effect-tsrs. We decided (2026-11-01, issue #603)
that Adamantite runs Oxlint through a proxy. The proxy loads the builds that the project needs,
and nothing changes in `node_modules`.

## The toolchain

A toolchain is the Oxlint package, its native binding, and its type-aware backend.
`resolveToolchain` in `src/lib/integrations/tooling/oxlint/toolchain.ts` resolves it. Each part
is `Stock`, so Oxlint finds its own file, or `Replaced` with a path. A project that installs
`@effect/tsgo` gets the Effect builds of the installed Oxlint and oxlint-tsgolint versions from
the platform package `@effect/tsgo-<platform>`. Every other project runs Oxlint as it is
installed.

The installed package decides, not the import of `adamantite/lint/effect`. This repository
imports its presets by relative path, and a monorepo can import the preset in a nested config.
The builds come from that package, so the project must install it in any case.

## The entry

`src/oxlint.ts` builds to `dist/oxlint.js`. It resolves the toolchain, sets
`OXLINT_TSGOLINT_PATH` for a replaced backend, and imports Oxlint's `dist/cli.js`, which reads
the arguments. Oxlint loads its binding from `NAPI_RS_NATIVE_LIBRARY_PATH` once, when
`dist/bindings.js` loads. Every napi-rs package reads that variable, so a JS plugin that loads
`oxc-parser` or `oxc-resolver` got the Oxlint binding instead of its own. The proxies of
`@effect/tsgo` 0.63.0 (`effect-tsgo oxlint`) and of effect-tsrs 0.2.3 set the variable for the
whole process, and both failed on this repository with `ResolverFactory is not a constructor`.
For a replaced binding, the entry sets the variable, imports `bindings.js`, and deletes the
variable. JS plugins load later, through dynamic imports in `cli.js`.

`check`, `fix`, and `harden` start the entry with `node` and name the project in
`ADAMANTITE_PROJECT`. The CLI can run from a package runner cache, such as `npm exec` or
`pnpm dlx`, so the entry path does not show the project. Editors name no project. The VS Code
integration sets `oxc.path.oxlint` to the relative path `node_modules/adamantite/dist/oxlint.js`,
which the Oxc extension resolves against the first workspace folder. The extension expands no
`${workspaceFolder}`, and it starts the language server without a working directory in the
project. The Zed integration sets `lsp.oxlint.binary`, and Zed starts the server in the worktree
root, so the same relative path resolves. Without a named project, the entry takes the folder
above the first `node_modules` folder in its path. An entry outside `node_modules`, such as
`node src/oxlint.ts` in this repository, uses the working directory. The package has no bin for
the entry, so no user script depends on it, and Adamantite can remove the proxy when Oxlint loads
these builds on its own.

## Considered options

- **Set the environment and start the stock `oxlint`,** as the upstream proxies do. The variable
  reaches every napi-rs package in the process.
- **An `adamantite oxlint` subcommand.** `oxc.path.oxlint` takes one path and adds `--lsp`, so
  editors still need a file to start, and there would be two ways to run the proxy.
- **A toolchain lockfile that `init`, `update`, and `prepare` write.** It goes stale after each
  install, as the patch did, so it needs the install hook again.
- **Keep patching with tsrs builds,** through `effect-tsgo patch --tsrs` or
  `effect-tsrs patch --oxlint`. This keeps every cost of the patch, and the patches conflict.

## Consequences

- A target project needs no `prepare` script. `adamantite prepare` does nothing until #444
  removes it, and Doctor reports a `prepare` script that still runs it.
- A plain `oxlint` call in a project with the `effect` preset stops with
  `Unknown plugin: 'effecttsgo'`. Run `adamantite check` instead.
- The entry depends on two internal files of Oxlint, `dist/bindings.js` and `dist/cli.js`. The
  pinned Oxlint version and the real Oxlint runs in `src/__tests__/presets/effect.test.ts` catch
  a change of that layout. One of those runs loads a JS plugin that loads `oxc-parser`, so it fails
  when the variable outlives the binding.
- Nothing patches `tsc` anymore, so editors lose the Effect quick fixes, refactors, and hovers
  that the patched TypeScript gave. The tsconfig entry stays, because the Oxlint rules read their
  options from it. Step 5 of #603 tracks the editor features.
- Oxlint's config types list only its built-in plugins, so `presets/lint/effect.ts` has an
  `@ts-expect-error` on `plugins: ["effecttsgo"]` until those types accept it.
- On a small target project with the `effect` preset, the entry takes 0.50 to 0.51 s, against
  0.40 to 0.41 s for the patched Oxlint (5 runs each). The difference is the Effect runtime and the
  module resolver that the entry loads before Oxlint.
- When Oxlint finds `tsrs-lint` itself, or runs tsrs inside its process, the backend becomes
  `Stock` again for projects without the `effect` preset, and the entry changes nothing for
  them.
