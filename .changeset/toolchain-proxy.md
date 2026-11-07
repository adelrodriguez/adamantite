---
"adamantite": minor
---

Run Oxlint with the Effect builds of `@effect/tsgo` without patching `node_modules`

`adamantite check`, `fix`, and `harden` now start Oxlint through `node_modules/adamantite/dist/oxlint.js`. When the project installs `@effect/tsgo`, this entry loads the Effect builds of the Oxlint binding and oxlint-tsgolint for the installed versions. Nothing patches `node_modules` anymore, so the effect preset works after any install, also with a read-only package store, and a production-only install no longer fails at the `prepare` script.

`adamantite init` and `adamantite update` no longer run `effect-tsgo patch`, and `init` no longer writes a `prepare` script. The VS Code integration sets `oxc.path.oxlint`, and the Zed integration sets `lsp.oxlint.binary`, so editors start the same entry.

`adamantite doctor` reports an existing VS Code or Zed settings file that does not start Oxlint through the entry. Each finding gives the current value and the required setting. Doctor does not change the settings files.

To upgrade an existing project:

- Remove `adamantite prepare` from the `prepare` script in `package.json`, and delete the script when nothing else is left. `adamantite prepare` now does nothing, and a later release removes it. `adamantite doctor` reports the script.
- Point your editor at the entry. In `.vscode/settings.json`, set `"oxc.path.oxlint": "node_modules/adamantite/dist/oxlint.js"`. In `.zed/settings.json`, set `lsp.oxlint.binary` to `{ "path": "node", "arguments": ["node_modules/adamantite/dist/oxlint.js", "--lsp"] }`. `adamantite update` does not change editor settings.
- Replace a plain `oxlint` call, such as in a lint-staged config, with `adamantite check --only lint`. Plain `oxlint` cannot load the effect preset.
- Run `adamantite init --non-interactive --script check --preset effect --editor vscode --editor zed --install-extensions` for Effect hovers, refactors, and semantic quick fixes. VS Code uses a native SDK copy in `node_modules/.cache/adamantite/effect-sdk/`; Zed starts the installed upstream CLI. The language service enables diagnostics, and the managed editor settings hide duplicate Oxlint Effect reports.
- After a fresh install or dependency update, run `adamantite init --non-interactive --script check --editor vscode` to prepare or refresh the SDK cache. Doctor reports missing settings and a missing or stale SDK without changing files. Installed package files stay unchanged, and install scripts can stay disabled.
