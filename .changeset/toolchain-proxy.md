---
"adamantite": minor
---

Run Oxlint with the Effect builds of `@effect/tsgo` without patching `node_modules`

`adamantite check`, `fix`, and `harden` now start Oxlint through `node_modules/adamantite/dist/oxlint.js`. When the project installs `@effect/tsgo`, this entry loads the Effect builds of the Oxlint binding and oxlint-tsgolint for the installed versions. Nothing patches `node_modules` anymore, so the effect preset works after any install, also with a read-only package store, and a production-only install no longer fails at the `prepare` script.

`adamantite init` and `adamantite update` no longer run `effect-tsgo patch`, and `init` no longer writes a `prepare` script. The VS Code integration sets `oxc.path.oxlint`, and the Zed integration sets `lsp.oxlint.binary`, so editors start the same entry.

To upgrade an existing project:

- Remove `adamantite prepare` from the `prepare` script in `package.json`, and delete the script when nothing else is left. `adamantite prepare` now does nothing, and a later release removes it. `adamantite doctor` reports the script.
- Point your editor at the entry. In `.vscode/settings.json`, set `"oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js"`. In `.zed/settings.json`, set `lsp.oxlint.binary` to `{ "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js", "--lsp"] }`. `adamantite update` does not change editor settings.
- Replace a plain `oxlint` call, such as in a lint-staged config, with `adamantite check --only lint`. Plain `oxlint` cannot load the effect preset.
- The patch had also put the Effect quick fixes, refactors, and hovers into the `tsc` of editors. Adamantite no longer patches TypeScript. To keep those features, run `npx effect-tsgo patch --typescript` yourself after each install.
